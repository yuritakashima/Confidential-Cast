import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedConfidentialCast = await deploy("ConfidentialCast", {
    from: deployer,
    log: true,
  });

  console.log(`ConfidentialCast contract: `, deployedConfidentialCast.address);
};
export default func;
func.id = "deploy_confidentialCast"; // id required to prevent reexecution
func.tags = ["ConfidentialCast"];
