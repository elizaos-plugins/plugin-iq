import { IQ_SERVICE_NAME } from "../typescript/constants";
const inscribeDataAction = {
    name: "INSCRIBE_DATA",
    similes: [
        "WRITE_ONCHAIN",
        "STORE_ONCHAIN",
        "SAVE_SOLANA",
        "INSCRIBE_SOLANA",
    ],
    description: "Inscribe arbitrary data permanently to Solana using IQLabs SDK. Data is stored on-chain forever.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("inscribe") ||
            text.includes("store") && text.includes("chain") ||
            text.includes("write") && text.includes("solana") ||
            text.includes("save") && text.includes("onchain"));
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
        const data = options?.data;
        const table = options?.table || "default";
        if (!data) {
            if (callback) {
                await callback({
                    text: "Please provide data to inscribe.",
                    error: true,
                });
            }
            return { success: false, error: "Missing data" };
        }
        try {
            const txSig = await service.inscribeData(data, table);
            if (callback) {
                await callback({
                    text: `Data inscribed successfully! Transaction: ${txSig}`,
                    data: { txSig, table },
                });
            }
            return { success: true, txSig, table };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to inscribe data: ${errorMessage}`,
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
                    text: "Inscribe this data to Solana: {\"key\": \"value\"}",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll inscribe that data permanently to Solana.",
                    action: "INSCRIBE_DATA",
                },
            },
        ],
    ],
};
export default inscribeDataAction;
//# sourceMappingURL=inscribeData.js.map