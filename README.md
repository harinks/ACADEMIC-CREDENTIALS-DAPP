# Academic Credential Verification DApp

## 1. Project Title & Description
**HireMe: Academic Credential Verification DApp**
HireMe is a decentralized application designed to combat fraud in academic certifications. It allows universities to issue verfiied academic credentials on the Ethereum Blockchain. Students can securely share their credentials with employers and employers can instantly verify them without manual university confirmations.
## Features:
Issue academic credentials on-chain
Unique credential hash generation
Public verification system
Credential revocation capability
Credential restoration (unrevoke)
Event logging for transparency
## 2. Team Members
- Hariharan NKS - 9599319       
- Kusha Latha Azmeera- 8884869   Frontend developer
- Om 
-Yushen
## Smart Contract Architecture:
The university deploys the contract and is responsible for issuing, revoking and restoring credentials. It contains name, university, degree, field,student wallet address, revocation status, whether the credential exists. The credentials are stored in a unique credential hash.

## 3. System Architecture
```mermaid
graph TD;
    A[Employer / Verifier] -->|Hash| B(VeriCred DApp UI);
    C[University Admin] -->|Student Data| B;
    B -->|Ethers.js / Web3.js| D[MetaMask];
    D -->|Transactions| E[Local Hardhat Node / Ganache];
    E --> F[AcademicCredentials Smart Contract];
Roles:
-**University/Admin:** The deploying address and authorized issuer of credential
-**Students:** Credential Receiver
```
- **Frontend Layer:** Built using React, Vite, and aesthetic TailwindCSS glassmorphism.
- **Web3 Provider Layer:** MetaMask facilitates user connections and signs transactions.
- **Blockchain Layer:** Local Hardhat/Ganache instances executing EVM bytecode.

## 4. Technologies Used
- **Smart Contract:** Solidity (v0.8.20), Hardhat Framework
- **Frontend Development:** React.js, Javascript
- **Web3 Integration:** Ethers.js, MetaMask Wallet
- **Testing:** Hardhat, Mocha, Chai
Solidity is used to write the smart contract that manages academic credentials
React.js builds the user interface for issuing and verifying credentials
ethers.js connects the frontend with the blockchain
MetaMask allows the users to interact with the contract using their wallet
            -styles the frontend interface

## 5. Prerequisites
- **Node.js:** v18.0 or newer
- **MetaMask Extension:** Installed in Chrome browser. Ethereum wallet used to connect the frontend to the blockchain and sign the transactions
- **Git** to clone and manage the project repository
- **Hardhat** Ethereum development environment used for compiling, testing and deploying smart contracts
## 6. User Guide
1. Clone the repository
git clone https://github.com/username/credential-dapp.git
cd credential-dapp
2. Install all required packages
npm install
3. Compile smart contracts
npx hardhat compile
4. Start Local Blockchain
npx hardhat node
5. Deploy Smart Contract
npx hardhat run scripts/deploy.js --network localhost
6. Run the frontend
npm start
7. Open the application
http://localhost:3000
8. Connect to your MetaMask wallet to interact with the smart contract
## 7. Smart Contract functions
constructor()- initializes the contract and controls credential issuance and revocation
issuecredential() - Admin only
function issueCredential(
    address _student,
    string memory _name,
    string memory _university,
    string memory _degree,
    string memory _field
) public onlyAdmin returns (bytes32 credentialHash)
Stores the credential data,generates unique hash
getcredential()
function getCredential(bytes32 _credentialHash) public view returns 
Retrieves full credential information
revokeCredential()  - Admin only
function revokeCredential(bytes32 _credentialHash) public onlyAdmin
Revokes a previously issued credential
unrevokeCredential()  - Admin only
function unrevokeCredential(bytes32 _credentialHash) public onlyAdmin
Ensures the credential exists, revoked and restores it to active status
verifyCredential()
function verifyCredential(bytes32 _credentialHash) public view returns (bool)
Verifies if a credential is valid
## Events
CredentialIssued
When a credential is created
event CredentialIssued(
    bytes32 credentialHash,
    address student,
    string name,
    string university,
    string degree,
    string field
);
CredentialRevoked
When a credential is revoked
event CredentialRevoked(bytes32 credentialHash);
CredentialUnrevoked
When a credential is restored
event CredentialUnrevoked(bytes32 credentialHash);
## Sample workflow
1. University issues credential
issueCredential(studentAddress, "Kusha", "UOWD", "BE", "Electronics")
2. Contract returns acredential hash
0x8b21a4e5...
3. Employer verifies credential 
verifyCredential(credentialHash)
Returns: true
4. If credential is revoked
verifyCredential(credentialHash)
Returns: false