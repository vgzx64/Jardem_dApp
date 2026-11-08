// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {EmergencyLedger} from "../src/EmergencyLedger.sol";

contract EmergencyLedgerTest is Test {
    address public relayer = address(0x1234);
    address public unauthorized = address(0x5678);
    EmergencyLedger public ledger;

    string constant EVENT_ID = "evt-001";
    string constant OPERATION_ID = "op-001";
    bytes32 constant PAYLOAD_HASH = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

    function setUp() public {
        ledger = new EmergencyLedger(relayer);
    }

    function test_RecordEvent_Success() public {
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, OPERATION_ID, PAYLOAD_HASH);

        assertTrue(ledger.processedEventId(keccak256(abi.encodePacked(EVENT_ID))));
        assertTrue(ledger.processedOperationId(keccak256(abi.encodePacked(OPERATION_ID))));
    }

    function test_RecordEvent_RejectsUnauthorized() public {
        vm.expectRevert(EmergencyLedger.NotRelayer.selector);
        vm.prank(unauthorized);
        ledger.recordEvent(EVENT_ID, OPERATION_ID, PAYLOAD_HASH);
    }

    function test_RecordEvent_RejectsDuplicateEventId() public {
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, OPERATION_ID, PAYLOAD_HASH);

        vm.expectRevert(EmergencyLedger.EventIdAlreadyProcessed.selector);
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, "op-002", PAYLOAD_HASH);
    }

    function test_RecordEvent_RejectsDuplicateOperationId() public {
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, OPERATION_ID, PAYLOAD_HASH);

        vm.expectRevert(EmergencyLedger.OperationIdAlreadyProcessed.selector);
        vm.prank(relayer);
        ledger.recordEvent("evt-002", OPERATION_ID, PAYLOAD_HASH);
    }

    function testFuzz_RecordEvent_DoesNotRevertOnValidInput(
        string calldata eventId,
        string calldata operationId,
        bytes32 payloadHash
    ) public {
        vm.prank(relayer);
        ledger.recordEvent(eventId, operationId, payloadHash);
    }

    function test_Invariant_ProcessedEventIdNeverResets() public {
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, OPERATION_ID, PAYLOAD_HASH);

        bytes32 eventIdHash = keccak256(abi.encodePacked(EVENT_ID));
        assertTrue(ledger.processedEventId(eventIdHash));

        // A second call with a different operationId but same eventId must revert,
        // proving the flag never resets.
        vm.expectRevert(EmergencyLedger.EventIdAlreadyProcessed.selector);
        vm.prank(relayer);
        ledger.recordEvent(EVENT_ID, "op-002", PAYLOAD_HASH);
    }
}
