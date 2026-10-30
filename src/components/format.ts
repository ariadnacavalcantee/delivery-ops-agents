const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const n1 = (n: number) => nf1.format(n);
export const int = (n: number) => n.toLocaleString("pt-BR");
export const signed = (n: number) => `${n > 0 ? "+" : ""}${n1(n)}`;
