import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { CONTRACT_ADDRESS, CONTRACT_ABI, EXPECTED_CHAIN_ID } from "./config";
import { ShieldCheck, UserCheck, ShieldClose, Lock, Copy, List, QrCode, RefreshCw, XCircle, CheckCircle2, GraduationCap, Building2, Award, FileCheck, Search, ChevronDown, ChevronUp } from "lucide-react";

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [provider, setProvider] = useState(null);
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Roles & Routing state
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard", "verify"
  
  // URL Param Verification Mode
  const [urlVerifyHash, setUrlVerifyHash] = useState(null);

  // Forms & Inputs
  const [issueForm, setIssueForm] = useState({ student: "", name: "", university: "", degree: "", field: "" });
  const [verifyHashInput, setVerifyHashInput] = useState("");
  const [revokeHash, setRevokeHash] = useState("");
  const [unrevokeHash, setUnrevokeHash] = useState("");
  
  // Display Data
  const [verifyResult, setVerifyResult] = useState(null); // { isValid: bool, data: array }
  const [history, setHistory] = useState([]); // List of { hash, student, name, ... }
  
  // Modals
  const [qrModal, setQrModal] = useState(null); // holds credentialHash to show QR
  const [expandedGroups, setExpandedGroups] = useState({}); // Tracking which ledger groups are open

  useEffect(() => {
    // Check for ?verify=0xHASH
    const params = new URLSearchParams(window.location.search);
    const verifyParam = params.get("verify");
    if (verifyParam) {
      setUrlVerifyHash(verifyParam);
      setVerifyHashInput(verifyParam);
      setActiveTab("verify");
      // If there's a verify param, we can try to verify immediately using a read-only provider
      verifyReadOnly(verifyParam);
    }

    checkConnection();
    
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
    return () => {
      if (window.ethereum) window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  // Fetch read-only verification (no MetaMask needed)
  const verifyReadOnly = async (hash) => {
    try {
      setLoading(true);
      setError("");
      setVerifyResult(null);
      // Connect to Ganache through the Vite proxy (works over ngrok)
      const rpcUrl = `${window.location.origin}/rpc`;
      const p = new ethers.JsonRpcProvider(rpcUrl);
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
      
      const isValid = await c.verifyCredential(hash);
      const data = await c.getCredential(hash);
      
      setVerifyResult({ isValid, data });
    } catch (err) {
      setError("Failed to verify credential. Make sure Ganache is running and the hash is valid.");
    }
    setLoading(false);
  };

  const copyToClipboard = (text, successMsg = "Copied to clipboard!") => {
    // Instant UI feedback
    setSuccess(successMsg);
    setTimeout(() => setSuccess(""), 1000);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(err => {
        console.warn("Clipboard API failed, trying fallback...", err);
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "absolute";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
    document.body.removeChild(textArea);
  };

  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      setAccount(null);
      setIsAdmin(false);
      setContract(null);
      setProvider(null);
    } else {
      setAccount(accounts[0]);
      // Re-init contract with new signer
      await connectWallet();
    }
  };

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (err) {
         console.error(err);
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask!");
      return;
    }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      const network = await p.getNetwork();
      if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
        setError("Please connect to Localhost 1337 / Ganache!");
        return;
      } else {
        setError("");
      }
      
      const signer = await p.getSigner();
      const address = await signer.getAddress();
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      setAccount(address.toLowerCase());
      setProvider(p);
      setContract(c);
      
      // Role Check
      const adminAddress = await c.admin();
      const isAdm = (address.toLowerCase() === adminAddress.toLowerCase());
      setIsAdmin(isAdm);
      
      setSuccess(`Wallet connected as ${isAdm ? 'Admin' : 'Student'}!`);
      setTimeout(() => setSuccess(""), 3000);
      
      // Load History based on role
      await loadHistory(c, address, isAdm);
      
    } catch (err) {
      setError(err.message || "Failed to connect wallet.");
    }
  };

  // Fetch History from Events
  const loadHistory = async (c, userAddress, isAdm) => {
    try {
      // Create filter for CredentialIssued
      // If student, filter by Topic 2 (student address)
      const filter = isAdm 
        ? c.filters.CredentialIssued() 
        : c.filters.CredentialIssued(undefined, userAddress);
        
      const events = await c.queryFilter(filter, 0, "latest");
      
      const historyData = events.map(e => ({
        hash: e.args[0],
        student: e.args[1],
        name: e.args[2],
        university: e.args[3],
        degree: e.args[4],
        field: e.args[5],
      })).reverse(); // newest first
      
      // Enrich history with status
      const detailedHistory = await Promise.all(historyData.map(async (h) => {
        try {
          const det = await c.getCredential(h.hash);
          return { ...h, isRevoked: det[5] };
        } catch {
          return { ...h, isRevoked: false };
        }
      }));
      setHistory(detailedHistory);
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  /* ----- ADMIN ACTIONS ----- */
  const handleIssue = async (e) => {
    e.preventDefault();
    if (!contract || !isAdmin) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const tx = await contract.issueCredential(
        issueForm.student, issueForm.name, issueForm.university, issueForm.degree, issueForm.field
      );
      const receipt = await tx.wait();
      
      const eventLog = receipt.logs.find(l => l.topics && l.topics.length >= 2);
      const hash = eventLog ? eventLog.topics[1] : "Hash extraction failed.";
      
      setSuccess(`Credential Issued! Hash: ${hash}`);
      setIssueForm({ student: "", name: "", university: "", degree: "", field: "" });
      await loadHistory(contract, account, isAdmin);
    } catch (err) {
      setError(err.reason || err.message || "Failed to issue credential.");
    }
    setLoading(false);
  };

  const handleRevoke = async (e) => {
    e.preventDefault();
    if (!contract || !isAdmin) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const tx = await contract.revokeCredential(revokeHash);
      await tx.wait();
      setSuccess(`Credential gracefully revoked.`);
      setRevokeHash("");
    } catch (err) {
      setError(err.reason || err.message || "Failed to revoke credential.");
    }
    setLoading(false);
  };

  const handleUnrevoke = async (e) => {
    e.preventDefault();
    if (!contract || !isAdmin) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const tx = await contract.unrevokeCredential(unrevokeHash);
      await tx.wait();
      setSuccess(`Credential access restored (Unrevoked).`);
      setUnrevokeHash("");
    } catch (err) {
      setError(err.reason || err.message || "Failed to unrevoke credential.");
    }
    setLoading(false);
  };

  /* ----- PUBLIC/EMPLOYER ACTIONS ----- */
  const handleVerifyForm = async (e) => {
    e.preventDefault();
    verifyReadOnly(verifyHashInput);
  };

  const toggleGroup = (studentAddress) => {
    setExpandedGroups(prev => ({ ...prev, [studentAddress]: !prev[studentAddress] }));
  };

  /* ----- UI COMPONENTS ----- */
  const renderNavbar = () => (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setActiveTab("dashboard"); setUrlVerifyHash(null); window.history.pushState({}, '', '/'); }}>
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-2.5 rounded-xl shadow-lg shadow-slate-200 group-hover:scale-105 transition-transform duration-300">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-slate-800">
              Hire<span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-700 to-slate-900">Me</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setActiveTab(activeTab === "verify" ? "dashboard" : "verify")}
              className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2"
            >
              {activeTab === "verify" ? "Return to Dashboard" : <><Search className="w-4 h-4"/> Public Verification</>}
            </button>
            {account ? (
              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:border-indigo-200 transition-colors" title={isAdmin ? "University Admin Wallet" : "Student Wallet"}>
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAdmin ? 'University Admin' : 'Student Verified'}</span>
                  <span className="text-sm font-bold text-slate-700 font-mono flex items-center gap-1.5">
                    {account.substring(0, 6)}...{account.substring(38)}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-xl shadow-slate-900/20 active:scale-95 flex items-center gap-2"
              >
                <Lock className="w-4 h-4" /> Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );

  const renderAlerts = () => (
    <div className="max-w-5xl mx-auto px-4 mt-6">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm mb-4 flex items-center justify-between gap-3 fade-in">
          <div className="flex items-center gap-3">
            <ShieldClose className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium break-all">{error}</p>
          </div>
          <button onClick={() => setError("")}><XCircle className="w-5 h-5 text-red-400 hover:text-red-600"/></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg shadow-sm mb-4 flex items-center justify-between gap-3 fade-in">
           <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700 font-medium break-all">{success}</p>
          </div>
          <button onClick={() => setSuccess("")}><XCircle className="w-5 h-5 text-green-400 hover:text-green-600"/></button>
        </div>
      )}
    </div>
  );

  const renderAdminDashboard = () => (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 mb-20">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600 tracking-tight">University Control Center</h1>
          <p className="text-slate-500 mt-2 text-lg font-medium">Issue, manage, and verify academic credentials on the blockchain.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
          <Building2 className="w-8 h-8 text-indigo-500 p-1.5 bg-indigo-50 rounded-xl" />
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Role</p>
            <p className="text-sm font-semibold text-slate-700">Administrator</p>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-8 lg:gap-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {/* Issue Section */}
          <section className="bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 rounded-full blur-3xl -mt-10 -mr-10 transition-transform group-hover:scale-150 duration-700"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 mb-6 shadow-lg shadow-slate-200">
                <GraduationCap className="text-white w-6 h-6"/>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Issue Credential</h2>
              <form onSubmit={handleIssue} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Student Wallet Address</label>
                  <input required value={issueForm.student} onChange={e=>setIssueForm({...issueForm, student: e.target.value})} type="text" className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/20 focus:border-slate-500 outline-none font-mono text-sm transition-all shadow-inner" placeholder="0x..." />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name</label>
                    <input required value={issueForm.name} onChange={e=>setIssueForm({...issueForm, name: e.target.value})} type="text" className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-all shadow-inner" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">University</label>
                    <input required value={issueForm.university} onChange={e=>setIssueForm({...issueForm, university: e.target.value})} type="text" className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-all shadow-inner" placeholder="MIT" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Degree Title</label>
                    <input required value={issueForm.degree} onChange={e=>setIssueForm({...issueForm, degree: e.target.value})} type="text" className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-all shadow-inner" placeholder="B.S." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Major / Field</label>
                    <input required value={issueForm.field} onChange={e=>setIssueForm({...issueForm, field: e.target.value})} type="text" className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-all shadow-inner" placeholder="Computer Science" />
                  </div>
                </div>
                <button disabled={loading} type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-base shadow-xl shadow-slate-900/20 hover:bg-slate-800 hover:shadow-2xl hover:-translate-y-0.5 transition-all mt-4 flex items-center justify-center gap-2">
                  <FileCheck className="w-5 h-5"/> Issue New Credential
                </button>
              </form>
            </div>
          </section>

          {/* Integrity Controls */}
          <section className="bg-red-50/50 border border-red-100 p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-center">
            <h2 className="text-xl font-bold text-red-900 mb-6 flex gap-3 items-center">
              <span className="p-2 bg-red-100 rounded-xl"><ShieldClose className="w-5 h-5 text-red-600"/></span> 
              Integrity Controls
            </h2>
            
            <form onSubmit={handleRevoke} className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-red-800/70 mb-1.5">Permanently Revoke Hash</label>
              <div className="flex gap-2">
                <input required value={revokeHash} onChange={e=>setRevokeHash(e.target.value)} type="text" className="flex-1 px-4 py-3 bg-white border border-red-200 rounded-xl font-mono text-sm focus:ring-4 focus:ring-red-500/20 outline-none shadow-inner" placeholder="0x..." />
                <button disabled={loading} type="submit" className="bg-red-600 text-white px-6 rounded-xl font-bold shadow-lg hover:bg-red-700 hover:shadow-red-600/30 transition-all cursor-pointer">Revoke</button>
              </div>
            </form>

            <form onSubmit={handleUnrevoke} className="pt-6 border-t border-red-200/50">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-800/70 mb-1.5">Restore Access (Unrevoke)</label>
              <div className="flex gap-2">
                <input required value={unrevokeHash} onChange={e=>setUnrevokeHash(e.target.value)} type="text" className="flex-1 px-4 py-3 bg-white border border-amber-200 rounded-xl font-mono text-sm focus:ring-4 focus:ring-amber-500/20 outline-none shadow-inner" placeholder="0x..." />
                <button disabled={loading} type="submit" className="bg-amber-500 text-white px-6 rounded-xl font-bold shadow-lg hover:bg-amber-600 hover:shadow-amber-500/30 transition-all cursor-pointer">Restore</button>
              </div>
            </form>
          </section>
        </div>

        {/* Global History */}
        <section className="bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-white">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-slate-800 flex gap-3 items-center">
               <span className="p-2 bg-slate-100 rounded-xl"><List className="w-5 h-5 text-slate-500"/></span>
               Global Issuance Ledger
            </h2>
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full block">{history.length} Records</span>
          </div>
          
          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-2.5 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {history.length === 0 ? <p className="text-sm text-slate-400 font-medium text-center py-20">No credentials have been issued globally yet.</p> : (
                <div className="space-y-6">
                  {Object.entries(history.reduce((acc, h) => {
                    if (!acc[h.student]) acc[h.student] = { name: h.name, credentials: [] };
                    acc[h.student].credentials.push(h);
                    return acc;
                  }, {})).map(([studentAddress, data], idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm relative overflow-hidden group/student">
                      <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-indigo-500 to-purple-600"></div>
                      
                      <div className="mb-2 pl-2 border-b border-slate-100 pb-4 cursor-pointer flex justify-between items-center group/header" onClick={() => toggleGroup(studentAddress)}>
                        <div className="flex items-center gap-4">
                          <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 shadow-sm transition-transform group-hover/header:scale-110 duration-300">
                            <UserCheck className="w-6 h-6 text-indigo-600"/>
                          </div>
                          <div>
                            <h3 className="font-extrabold text-slate-800 text-2xl tracking-tight leading-none mb-1 group-hover/header:text-indigo-700 transition-colors">Student Name: {data.name}</h3>
                            <p className="font-mono text-[10px] md:text-xs text-slate-500 uppercase tracking-widest break-all">{studentAddress}</p>
                          </div>
                        </div>
                        <div className="bg-slate-50 p-2 text-slate-400 rounded-xl group-hover/header:bg-indigo-50 group-hover/header:text-indigo-600 transition-colors">
                          {expandedGroups[studentAddress] ? <ChevronUp className="w-6 h-6"/> : <ChevronDown className="w-6 h-6"/>}
                        </div>
                      </div>
                      
                      {expandedGroups[studentAddress] && (
                        <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6 pl-2 animate-in slide-in-from-top-4 fade-in duration-300">
                          {data.credentials.map((h, i) => (
                            <li key={i} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl hover:bg-slate-100 hover:border-slate-300 transition-all duration-300">
                              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-4">
                                <div>
                                  <p className="font-extrabold text-slate-800 text-lg tracking-tight group-hover:text-slate-900 transition-colors mb-0.5 max-w-[200px] truncate" title={`${h.degree} in ${h.field}`}>{h.degree} <span className="text-slate-400 font-semibold text-base mx-1">in</span> {h.field}</p>
                                  <p className="text-sm font-bold text-slate-500 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5"/> {h.university}</p>
                                </div>
                                <div>
                                  {h.isRevoked ? (
                                     <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] uppercase tracking-wider font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm"><ShieldClose className="w-3.5 h-3.5"/> Revoked</span>
                                  ) : (
                                     <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] uppercase tracking-wider font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm"><CheckCircle2 className="w-3.5 h-3.5"/> Active</span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 mt-2 bg-white border border-slate-200 p-2 md:p-3 rounded-xl transition-colors shadow-sm">
                                <span className="text-[10px] md:text-[11px] font-mono text-slate-400 truncate flex-1 pl-2">{h.hash.substring(0, 10)}...{h.hash.slice(-8)}</span>
                                <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(h.hash, "Hash copied!"); }} title="Copy Hash" className="text-slate-500 hover:text-indigo-600 bg-slate-50 p-2 rounded-lg shadow-sm border border-slate-200 hover:border-indigo-300 transition-all active:scale-95 flex items-center gap-1.5">
                                    <Copy className="w-4 h-4"/>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(`${window.location.origin}/?verify=${h.hash}`, "Verification Link Copied!"); }} title="Copy Verification Link" className="text-slate-500 hover:text-indigo-600 bg-slate-50 p-2 rounded-lg shadow-sm border border-slate-200 hover:border-indigo-300 transition-all active:scale-95 flex items-center gap-1.5">
                                    <List className="w-4 h-4"/>
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderStudentDashboard = () => (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">My Credentials Portfolio</h1>
          <p className="text-slate-500 mt-2 text-lg font-medium">Your tamper-proof cryptographic degrees, verified on the blockchain.</p>
        </div>
        {history.length > 0 && (
          <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-5 py-3 rounded-2xl flex items-center gap-3 shadow-sm">
            <Award className="w-8 h-8 text-emerald-500 bg-white p-1.5 rounded-xl shadow-sm"/>
            <div>
              <p className="text-xs uppercase tracking-widest font-bold opacity-70">Total Earned</p>
              <p className="text-lg font-extrabold">{history.length} Degrees</p>
            </div>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200 p-16 text-center rounded-[2rem] shadow-xl">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-slate-50 border-4 border-slate-100 mb-6 shadow-inner">
            <GraduationCap className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-2xl font-bold text-slate-700">No Credentials Found</h3>
          <p className="text-slate-500 mt-3 text-lg max-w-lg mx-auto">Your associated wallet address does not hold any verified degrees yet. Once your university issues them, they will securely appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {history.map((h, i) => (
            <div key={i} className="group relative rounded-[2rem] p-8 shadow-2xl overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-3xl bg-slate-900 hover:bg-slate-800">
              {/* Dynamic Abstract Background Gradient Art */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-slate-500/20 to-slate-400/10 rounded-full blur-3xl -mt-20 -mr-20 transition-all duration-700 group-hover:scale-150 group-hover:from-slate-500/30 group-hover:to-slate-300/20"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-slate-600/10 to-transparent rounded-full blur-2xl -mb-10 -ml-10"></div>
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-8">
                  <div className="bg-white/10 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-inner">
                    <Building2 className="text-slate-300 w-8 h-8" />
                  </div>
                  {h.isRevoked ? (
                    <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] uppercase font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-md"><ShieldClose className="w-3.5 h-3.5"/> Revoked Action</span>
                  ) : (
                    <ShieldCheck className="text-emerald-400 w-8 h-8 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  )}
                </div>
                
                <div className="mb-auto">
                  <p className="text-indigo-300/80 text-[11px] font-bold uppercase tracking-[0.2em] mb-2">{h.university}</p>
                  <h3 className="text-3xl font-extrabold text-white leading-tight mb-2 tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-indigo-200 transition-all">{h.degree}</h3>
                  <p className="text-lg text-slate-300 font-medium">in {h.field}</p>
                </div>
                
                <div className="mt-10 mb-8 border-l-2 border-indigo-500/30 pl-4 py-1">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Awarded to</p>
                  <p className="text-xl text-white font-semibold tracking-wide">{h.name}</p>
                </div>

                <div className="flex gap-3 mt-4 pt-6 border-t border-slate-700/50">
                   <button 
                     onClick={() => copyToClipboard(h.hash, "Hash copied!")}
                     className="flex-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2 border border-slate-600/50 hover:border-slate-500 transition-all active:scale-95 backdrop-blur-md"
                   >
                     <Copy className="w-4 h-4"/> Hash ID
                   </button>
                   <button 
                     onClick={() => setQrModal(h.hash)}
                     className="flex-1 bg-white hover:bg-slate-100 text-slate-900 py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] transition-all active:scale-95"
                   >
                     <QrCode className="w-4 h-4"/> Share QR
                   </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderVerifyPortal = () => (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 mb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-6 shadow-xl shadow-indigo-200 rotate-3 hover:rotate-6 transition-transform">
          <Search className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-900">Public Verification Portal</h1>
        <p className="text-slate-500 text-lg md:text-xl max-w-2xl mx-auto font-medium">Verify the authenticity of any university degree instantly utilizing blockchain consensus.</p>
      </div>

      <div className="bg-white/80 backdrop-blur-xl p-8 md:p-12 rounded-[2.5rem] shadow-2xl shadow-indigo-100/40 border border-white">
        <form onSubmit={handleVerifyForm} className="space-y-6">
          <label className="block text-sm font-bold text-indigo-900/60 uppercase tracking-[0.15em] mb-2 text-center md:text-left">Enter Unique Cryptographic Hash</label>
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              required value={verifyHashInput} onChange={e=>setVerifyHashInput(e.target.value)} 
              type="text" 
              className="flex-1 px-8 py-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono text-sm text-center sm:text-left shadow-inner" 
              placeholder="0x..." 
            />
            <button disabled={loading} type="submit" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-5 px-10 rounded-2xl transition-all shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/40 active:scale-[0.98] sm:w-auto w-full group flex items-center justify-center gap-3">
              {loading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto"/> : <><Search className="w-5 h-5 group-hover:scale-110 transition-transform"/> Verify Now</>}
            </button>
          </div>
        </form>

        {verifyResult && verifyResult.data && (
          <div className="mt-12 pt-10 border-t border-slate-200/50 animate-in fade-in slide-in-from-bottom-4">
            {verifyResult.isValid ? (
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-50 border-[6px] border-emerald-100 mb-5 relative before:absolute before:inset-0 before:rounded-full before:animate-ping before:bg-emerald-400 before:opacity-20">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-extrabold text-emerald-600 mb-2">Verified & Authentic</h2>
                <p className="text-emerald-900/60 font-medium">This credential is mathematically proven on the blockchain.</p>
              </div>
            ) : verifyResult.data[6] === false ? (
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-slate-50 border-[6px] border-slate-100 mb-5">
                  <ShieldClose className="w-12 h-12 text-slate-400" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-700 mb-2">Record Not Found</h2>
                <p className="text-slate-500 font-medium">This hash does not match any known credential.</p>
              </div>
            ) : (
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-50 border-[6px] border-red-100 mb-5">
                  <ShieldClose className="w-12 h-12 text-red-500" />
                </div>
                <h2 className="text-3xl font-extrabold text-red-600 mb-2">Revoked Credential</h2>
                <p className="text-red-900/60 font-medium">The issuing university has permanently invalidated this credential.</p>
              </div>
            )}

            {/* Premium Credential Card Output */}
            {verifyResult.data[6] && (
               <div className={`relative overflow-hidden rounded-[2rem] p-8 md:p-10 shadow-xl ${verifyResult.isValid ? 'bg-gradient-to-br from-emerald-50 to-teal-50/30 border border-emerald-100/50' : 'bg-gradient-to-br from-red-50 to-rose-50/30 border border-red-100/50'}`}>
                 {/* Watermark Logo background */}
                 <div className="absolute right-0 bottom-0 opacity-[0.03] scale-150 translate-x-1/4 translate-y-1/4 pointer-events-none">
                   <Award className="w-96 h-96"/>
                 </div>
                 
                 <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                       <UserCheck className="w-4 h-4"/> Holder Identity
                     </p>
                     <p className="font-extrabold text-2xl text-slate-800 tracking-tight">{verifyResult.data[0]}</p>
                   </div>
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                       <Building2 className="w-4 h-4"/> Issuing Institution
                     </p>
                     <p className="font-extrabold text-2xl text-slate-800 tracking-tight">{verifyResult.data[1]}</p>
                   </div>
                   <div className="md:col-span-2 pt-6 border-t border-slate-200/50">
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <GraduationCap className="w-4 h-4"/> Awarded Distinction
                     </p>
                     <p className={`font-black text-3xl md:text-4xl tracking-tight leading-tight ${verifyResult.isValid ? 'text-emerald-700' : 'text-red-700'}`}>
                       {verifyResult.data[2]} <span className="text-slate-400 font-semibold mx-2">in</span> {verifyResult.data[3]}
                     </p>
                   </div>
                   <div className="md:col-span-2 pt-6 border-t border-slate-200/50 flex flex-col items-center text-center">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cryptographic Binding Wallet</p>
                     <p className="font-mono text-sm text-slate-600 bg-white/60 px-4 py-2 rounded-xl border border-slate-200/50 break-all w-full max-w-xl shadow-inner">{verifyResult.data[4]}</p>
                   </div>
                 </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {renderNavbar()}
      {renderAlerts()}

      {/* Main View Router */}
      {activeTab === "verify" ? (
        renderVerifyPortal()
      ) : (
        !account ? (
           <div className="max-w-4xl mx-auto px-4 py-24 md:py-32 text-center animate-in fade-in zoom-in-95 duration-500">
             <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-white shadow-xl shadow-indigo-100 mb-8 border border-slate-100 group">
               <ShieldCheck className="w-16 h-16 text-indigo-500 group-hover:scale-110 transition-transform duration-500" />
             </div>
             <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">Decentralized Academic Credentials</h2>
             <p className="text-slate-500 mb-10 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">Universities and Students must formally authenticate via a Web3 cryptographic wallet to access their personalized profiles.</p>
             <button onClick={connectWallet} className="bg-slate-900 hover:bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold shadow-2xl shadow-slate-900/30 hover:shadow-indigo-600/40 text-lg transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 mx-auto">
               <Lock className="w-5 h-5"/> Authenticate with MetaMask
             </button>
           </div>

        ) : isAdmin ? (
          renderAdminDashboard()
        ) : (
          renderStudentDashboard()
        )
      )}

      {/* QR Code Modal for Student View */}
      {qrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full text-center shadow-2xl shadow-indigo-900/50 relative border border-white">
            <button onClick={() => setQrModal(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors">
              <XCircle className="w-6 h-6"/>
            </button>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 border-4 border-white shadow-sm mb-4">
              <QrCode className="w-8 h-8 text-indigo-600"/>
            </div>
            <h3 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Scan Verify QR</h3>
            <p className="text-slate-500 text-sm mb-8 font-medium">Anyone who scans this cryptographic code can instantly verify your degree's authenticity via the blockchain.</p>
            
            <div className="bg-white p-6 rounded-[2rem] flex justify-center mb-8 border-2 border-slate-100 shadow-inner">
               <QRCodeSVG 
                 value={`${window.location.origin}/?verify=${qrModal}`}
                 size={250}
                 bgColor={"#ffffff"}
                 fgColor={"#0f172a"}
                 level={"H"}
                 includeMargin={false}
               />
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={async () => { await copyToClipboard(`${window.location.origin}/?verify=${qrModal}`, "Verification link copied!"); setQrModal(null); }}
                className="flex-1 bg-slate-900 text-white hover:bg-indigo-600 font-bold py-4 rounded-xl transition-all shadow-lg shadow-slate-900/20 active:scale-95 flex items-center justify-center gap-2"
              >
                <List className="w-5 h-5"/> Copy Direct Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

