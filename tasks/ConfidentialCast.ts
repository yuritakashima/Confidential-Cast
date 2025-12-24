import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Examples (localhost):
 *   npx hardhat --network localhost deploy
 *   npx hardhat --network localhost task:address
 *   npx hardhat --network localhost task:update-price --price 64000
 *   npx hardhat --network localhost task:submit-prediction --price 63000 --direction 1 --stake 0.01
 *   npx hardhat --network localhost task:confirm --day 19700
 *   npx hardhat --network localhost task:decrypt-points
 *   npx hardhat --network localhost task:decrypt-result
 */

task("task:address", "Prints the ConfidentialCast address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get("ConfidentialCast");
  console.log("ConfidentialCast address is " + deployment.address);
});

task("task:update-price", "Updates the daily BTC price")
  .addOptionalParam("address", "Optionally specify the ConfidentialCast contract address")
  .addParam("price", "BTC price as an integer")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const price = Number(taskArguments.price);
    if (!Number.isInteger(price) || price <= 0) {
      throw new Error("Argument --price must be a positive integer");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialCast");
    const contract = await ethers.getContractAt("ConfidentialCast", deployment.address);

    const tx = await contract.updateDailyPrice(price);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:submit-prediction", "Submits an encrypted BTC prediction")
  .addOptionalParam("address", "Optionally specify the ConfidentialCast contract address")
  .addParam("price", "Predicted BTC price as integer")
  .addParam("direction", "1 for above, 2 for below")
  .addParam("stake", "Stake in ETH (e.g. 0.02)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const price = Number(taskArguments.price);
    const direction = Number(taskArguments.direction);
    if (!Number.isInteger(price) || price <= 0) {
      throw new Error("Argument --price must be a positive integer");
    }
    if (direction !== 1 && direction !== 2) {
      throw new Error("Argument --direction must be 1 or 2");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialCast");

    const signers = await ethers.getSigners();
    const stakeValue = ethers.parseEther(taskArguments.stake);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add64(price)
      .add8(direction)
      .encrypt();

    const contract = await ethers.getContractAt("ConfidentialCast", deployment.address);
    const tx = await contract.submitPrediction(
      encryptedInput.handles[0],
      encryptedInput.handles[1],
      encryptedInput.inputProof,
      { value: stakeValue },
    );
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:confirm", "Confirms a prediction for a given day")
  .addOptionalParam("address", "Optionally specify the ConfidentialCast contract address")
  .addParam("day", "Day index to confirm (UTC day number)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const day = Number(taskArguments.day);
    if (!Number.isInteger(day) || day < 0) {
      throw new Error("Argument --day must be a non-negative integer");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialCast");
    const contract = await ethers.getContractAt("ConfidentialCast", deployment.address);

    const tx = await contract.confirmPrediction(day);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:decrypt-points", "Decrypts the caller points balance")
  .addOptionalParam("address", "Optionally specify the ConfidentialCast contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialCast");
    const contract = await ethers.getContractAt("ConfidentialCast", deployment.address);

    const signers = await ethers.getSigners();
    const encryptedPoints = await contract.getPoints(signers[0].address);
    if (encryptedPoints === ethers.ZeroHash) {
      console.log("Encrypted points: 0x0");
      console.log("Clear points: 0");
      return;
    }

    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      deployment.address,
      signers[0],
    );
    console.log(`Encrypted points: ${encryptedPoints}`);
    console.log(`Clear points: ${clearPoints}`);
  });

task("task:decrypt-result", "Decrypts the caller last prediction result")
  .addOptionalParam("address", "Optionally specify the ConfidentialCast contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialCast");
    const contract = await ethers.getContractAt("ConfidentialCast", deployment.address);

    const signers = await ethers.getSigners();
    const encryptedResult = await contract.getLastResult(signers[0].address);
    if (encryptedResult === ethers.ZeroHash) {
      console.log("Encrypted result: 0x0");
      console.log("Clear result: false");
      return;
    }

    const clearResult = await fhevm.userDecryptEbool(
      FhevmType.ebool,
      encryptedResult,
      deployment.address,
      signers[0],
    );
    console.log(`Encrypted result: ${encryptedResult}`);
    console.log(`Clear result: ${clearResult}`);
  });
