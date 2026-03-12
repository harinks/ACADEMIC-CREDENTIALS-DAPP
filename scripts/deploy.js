import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const Contract = await hre.ethers.getContractFactory("AcademicCredentials");
  const contract = await Contract.deploy();

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("AcademicCredentials deployed to:", address);

  const info = {
    address: address,
    network: hre.network.name,
  };

  fs.writeFileSync(
    path.join(__dirname, "../contract-address.json"),
    JSON.stringify(info, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
