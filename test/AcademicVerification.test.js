import hre from "hardhat";
import { expect } from "chai";

describe("AcademicCredentials", function () {
  let AcademicCredentials;
  let contract;
  let admin;
  let student1;
  let employer;

  beforeEach(async function () {
    [admin, student1, employer] = await hre.ethers.getSigners();
    AcademicCredentials = await hre.ethers.getContractFactory(
      "AcademicCredentials",
    );
    contract = await AcademicCredentials.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });
  });

  describe("Issuing Credentials", function () {
    it("Should allow admin to issue a credential", async function () {
      const tx = await contract.issueCredential(
        student1.address,
        "John Doe",
        "Dubai University",
        "BSc Computer Science",
        "Engineering",
      );

      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .find((e) => e && e.name === "CredentialIssued");

      expect(event).to.not.be.undefined;
      const credentialHash = event.args.credentialHash;

      const cred = await contract.getCredential(credentialHash);
      expect(cred.name).to.equal("John Doe");
      expect(cred.university).to.equal("Dubai University");
      expect(cred.student).to.equal(student1.address);
    });

    it("Should fail if a non-admin tries to issue a credential", async function () {
      await expect(
        contract
          .connect(student1)
          .issueCredential(
            student1.address,
            "John Doe",
            "Dubai University",
            "BSc Computer Science",
            "Engineering",
          ),
      ).to.be.revertedWith("Only admin can call this");
    });
  });

  describe("Verification and Revocation", function () {
    let credentialHash;

    beforeEach(async function () {
      const tx = await contract.issueCredential(
        student1.address,
        "John Doe",
        "Dubai University",
        "BSc Computer Science",
        "Engineering",
      );
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .find((e) => e && e.name === "CredentialIssued");

      credentialHash = event.args.credentialHash;
    });

    it("Should return true for a valid credential", async function () {
      expect(await contract.verifyCredential(credentialHash)).to.be.true;
    });

    it("Should allow admin to revoke a credential", async function () {
      await contract.revokeCredential(credentialHash);

      const cred = await contract.getCredential(credentialHash);
      expect(cred.revoked).to.be.true;

      expect(await contract.verifyCredential(credentialHash)).to.be.false;
    });

    it("Should fail if non-admin tries to revoke", async function () {
      await expect(
        contract.connect(student1).revokeCredential(credentialHash),
      ).to.be.revertedWith("Only admin can call this");
    });

    it("Should fail to revoke an already revoked credential", async function () {
      await contract.revokeCredential(credentialHash);
      await expect(
        contract.revokeCredential(credentialHash),
      ).to.be.revertedWith("Already revoked");
    });
    it("Should allow admin to unrevoke a revoked credential", async function () {
      await contract.revokeCredential(credentialHash);
      let cred = await contract.getCredential(credentialHash);
      expect(cred.revoked).to.be.true;

      await contract.unrevokeCredential(credentialHash);
      cred = await contract.getCredential(credentialHash);
      expect(cred.revoked).to.be.false;
      expect(await contract.verifyCredential(credentialHash)).to.be.true;
    });

    it("Should fail if non-admin tries to unrevoke", async function () {
      await contract.revokeCredential(credentialHash);
      await expect(
        contract.connect(student1).unrevokeCredential(credentialHash),
      ).to.be.revertedWith("Only admin can call this");
    });
  });
});
