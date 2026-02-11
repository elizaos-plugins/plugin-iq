import { IQ_SERVICE_NAME } from "../typescript/constants";
const getWalletInfoAction = {
    name: "GET_WALLET_INFO",
    similes: [
        "CHECK_WALLET",
        "WALLET_INFO",
        "GET_BALANCE",
        "CHECK_BALANCE",
        "MY_WALLET",
    ],
    description: "Get wallet information including address and SOL balance for the IQ agent.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("wallet") ||
            text.includes("balance") ||
            text.includes("sol") ||
            text.includes("address"));
    },
    handler: async (runtime, message, state, options, callback) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            if (callback) {
                await callback({
                    text: "IQ service is not available.",
                    error: true,
                });
            }
            return { success: false, error: "Service not available" };
        }
        try {
            const address = service.getWalletAddress();
            const balance = await service.getBalance();
            if (callback) {
                await callback({
                    text: `Wallet Address: ${address}\nSOL Balance: ${balance.toFixed(4)} SOL`,
                    data: { address, balance },
                });
            }
            return { success: true, address, balance };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to get wallet info: ${errorMessage}`,
                    error: true,
                });
            }
            return { success: false, error: errorMessage };
        }
    },
    examples: [
        [
            {
                name: "{{user1}}",
                content: {
                    text: "What's my wallet address?",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Let me get your wallet information.",
                    action: "GET_WALLET_INFO",
                },
            },
        ],
        [
            {
                name: "{{user1}}",
                content: {
                    text: "Check my SOL balance",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Checking your SOL balance now.",
                    action: "GET_WALLET_INFO",
                },
            },
        ],
    ],
};
export default getWalletInfoAction;
//# sourceMappingURL=getWalletInfo.js.map