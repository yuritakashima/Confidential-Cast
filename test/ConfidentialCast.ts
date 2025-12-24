import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialCast, ConfidentialCast__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ConfidentialCast")) as ConfidentialCast__factory;
  const contract = (await factory.deploy()) as ConfidentialCast;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("ConfidentialCast", function () {
  let signers: Signers;
  let contract: ConfidentialCast;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("stores prediction metadata", async function () {
    const stakeValue = ethers.parseEther("0.05");
    const predictionPrice = 63000;
    const direction = 1;

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add64(predictionPrice)
      .add8(direction)
      .encrypt();

    await contract
      .connect(signers.alice)
      .submitPrediction(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: stakeValue,
      });

    const day = await contract.getCurrentDay();
    const metadata = await contract.getPredictionMetadata(signers.alice.address, day);
    expect(metadata[0]).to.eq(stakeValue);
    expect(metadata[2]).to.eq(false);
  });

  it("awards encrypted points for a correct prediction", async function () {
    const stakeValue = ethers.parseEther("0.1");
    const predictionPrice = 61000;
    const direction = 1;

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add64(predictionPrice)
      .add8(direction)
      .encrypt();

    await contract
      .connect(signers.alice)
      .submitPrediction(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: stakeValue,
      });

    const day = await contract.getCurrentDay();
    await contract.connect(signers.deployer).updateDailyPrice(65000);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 2]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(signers.alice).confirmPrediction(day);

    const encryptedPoints = await contract.getPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      contractAddress,
      signers.alice,
    );
    expect(clearPoints).to.eq(stakeValue);

    const encryptedResult = await contract.getLastResult(signers.alice.address);
    const clearResult = await fhevm.userDecryptEbool(
      FhevmType.ebool,
      encryptedResult,
      contractAddress,
      signers.alice,
    );
    expect(clearResult).to.eq(true);
  });
});
