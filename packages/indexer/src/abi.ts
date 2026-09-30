import { parseAbi } from "viem";

/** Events the hosted index stores. Job pages read the projection, not these logs. */
export const indexAbi = parseAbi([
    "event InstanceCreated(address indexed instance, address indexed token, address treasury, uint256 feeBP)",
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
    "event ProviderSet(uint256 indexed jobId, address indexed provider)",
    "event BudgetSet(uint256 indexed jobId, uint256 amount)",
    "event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)",
    "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
    "event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)",
    "event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)",
    "event JobExpired(uint256 indexed jobId)",
    "event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)",
    "event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)",
    "event Configured(address indexed instance, uint256 indexed jobId, address indexed client)",
    "event Escalated(address indexed instance, uint256 indexed jobId)",
    "event CaseOpened(address indexed instance, uint256 indexed jobId, address indexed arbiter, uint64 disputeDeadline, bytes32[] evidenceHashes)",
    "event DepositPosted(address indexed instance, uint256 indexed jobId, address indexed party, uint256 amount)",
    "event Ruled(address indexed instance, uint256 indexed jobId, address indexed arbiter, bool completed, bytes32 reasonHash)",
    "event TipPaid(address indexed instance, uint256 indexed jobId, address indexed to, uint256 amount)",
    "event FeePaid(address indexed instance, uint256 indexed jobId, address indexed operator, uint256 amount)",
    "event Swept(address indexed instance, uint256 indexed jobId, address indexed to, uint256 amount)",
]);
