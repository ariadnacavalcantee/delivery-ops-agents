import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

// O site é estático (GitHub Pages): não há servidor para guardar uma chave.
// Quem quiser ver os agentes com o Claude de verdade informa a própria chave,
// que fica só no navegador dessa pessoa e vai direto para a API da Anthropic.
let client: Anthropic | null = null;

export function setApiKey(key: string | null) {
  client = key ? new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) : null;
}

export function hasApiKey() {
  return client !== null;
}

const BASE_RULES = `Você é um agente do FoodOps AI, central de operações de delivery.
Responda SEMPRE em português do Brasil.
Responda APENAS com um objeto JSON válido, sem markdown e sem texto fora do JSON.
Baseie-se somente nos dados fornecidos. Nunca invente números: cite os que estão nos dados. Use vírgula como separador decimal (14,7 min).`;

export async function callJSON<T>(opts: {
  system: string;
  input: unknown;
  schemaHint: string;
  maxTokens?: number;
}): Promise<{ data: T; tokens: number }> {
  if (!client) throw new Error("Nenhuma chave de API configurada.");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    system: `${BASE_RULES}\n\n${opts.system}\n\nFormato de saída (JSON):\n${opts.schemaHint}`,
    messages: [{ role: "user", content: `Dados:\n${JSON.stringify(opts.input)}` }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const data = JSON.parse(json) as T;
  const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
  return { data, tokens };
}
