// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

/**
 * @title EmergencyLedger
 * @dev On-chain ledger for emergency response event proofs.
 *
 * Only the configured relayer (integration layer) may submit events.
 * Replay protection is enforced per eventId and per operationId.
 */
contract EmergencyLedger {
    address public immutable relayer;

    mapping(bytes32 => bool) public processedEventId;
    mapping(bytes32 => bool) public processedOperationId;

    event EventRecorded(
        string indexed eventId, string indexed operationId, bytes32 payloadHash, address submitter, uint256 timestamp
    );

    error NotRelayer();
    error EventIdAlreadyProcessed();
    error OperationIdAlreadyProcessed();

    constructor(address _relayer) {
        require(_relayer != address(0), "relayer cannot be zero");
        relayer = _relayer;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    /**
     * @dev Records an event proof on-chain. Reverts if the eventId or
     * operationId was already processed (replay protection).
     */
    function recordEvent(string calldata eventId, string calldata operationId, bytes32 payloadHash)
        external
        onlyRelayer
    {
        bytes32 eventIdHash = keccak256(abi.encodePacked(eventId));
        bytes32 operationIdHash = keccak256(abi.encodePacked(operationId));

        if (processedEventId[eventIdHash]) revert EventIdAlreadyProcessed();
        if (processedOperationId[operationIdHash]) revert OperationIdAlreadyProcessed();

        processedEventId[eventIdHash] = true;
        processedOperationId[operationIdHash] = true;

        emit EventRecorded(eventId, operationId, payloadHash, msg.sender, block.timestamp);
    }
}
