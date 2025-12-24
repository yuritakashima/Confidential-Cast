import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { ConfidentialCast } from "../types";
import { expect } from "chai";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("ConfidentialCastSepolia", function () {
  let signers: Signers;
  let contract: ConfidentialCast;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("ConfidentialCast");
      contract = await ethers.getContractAt("ConfidentialCast", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("returns a valid current day", async function () {
    const day = await contract.getCurrentDay();
    expect(day).to.be.greaterThan(0);
  });

  it("reads the latest price record", async function () {
    const latest = await contract.getLatestPrice();
    expect(latest[0]).to.be.a("bigint");
    expect(latest[2]).to.be.a("bigint");
    await contract.getPoints(signers.alice.address);
  });
});
