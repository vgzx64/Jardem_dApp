// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {EmergencyLedger} from "../src/EmergencyLedger.sol";

contract DeployEmergencyLedger is Script {
    function run() public {
        uint256 deployerPrivateKey = uint256(keccak256(abi.encodePacked("deployer-key")));

        vm.startBroadcast(deployerPrivateKey);

        address relayer = vm.addr(uint256(keccak256(abi.encodePacked("relayer-key"))));
        EmergencyLedger ledger = new EmergencyLedger(relayer);

        vm.stopBroadcast();

        console.log("EmergencyLedger deployed at:", address(ledger));
        console.log("Relayer:", relayer);
    }
}
