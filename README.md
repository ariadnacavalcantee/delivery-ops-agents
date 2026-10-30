# Delivery Ops Agents

Cinco agentes de IA analisam **atrasos reais de entrega** de um marketplace brasileiro, descobrem em que etapa o atraso nasceu e entregam um plano de ação para a gestora de operações.

**Demo:** https://ariadnacavalcantee.github.io/delivery-ops-agents/

## Os dados

A base é a [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) (CC BY-NC-SA 4.0): cerca de 100 mil pedidos reais feitos entre 2016 e 2018, com data de compra, aprovação, postagem, entrega, prazo prometido ao cliente e avaliação.

Escolhi três períodos que contam histórias diferentes. Cada um é comparado com as semanas anteriores (linha de base):

| Período | Atraso | O que os dados mostram |
| --- | --- | --- |
| Fev–mar 2018 | 21% (base 6,1%) | Vendedores postaram no prazo; o **transporte** ficou 3,2 dias mais lento, concentrado fora de SP, e o **prazo prometido encurtou** 3,9 dias ao mesmo tempo |
| Black Friday 2017 | 16,1% (base 4,2%) | Transporte mais lento **e** vendedores postando fora do prazo (de 8,2% para 14,8%) |
| Abril 2018 | 3,8% (base 8,9%) | Recuperação. Serve de controle: os agentes não podem inventar problema |

Em toda a base, pedido atrasado recebe nota média **2,3**, contra **4,3** dos que chegam no prazo.

## Os agentes

```
Monitor → [ Diagnóstico ∥ Vendedores ] → Ações → Relatório
```

| Agente | O que faz |
| --- | --- |
| Monitor | Compara o período com a linha de base e levanta alertas (estados, etapas, nota, vendedores) |
| Diagnóstico | Decompõe cada atraso em aprovação, postagem, transporte e prazo prometido |
| Vendedores | Separa quem atrasa por postar tarde de quem só vende para regiões afetadas pelo transporte |
| Ações | Transforma o diagnóstico em ações com responsável e urgência (agora, esta semana, próximo pico) |
| Relatório | Escreve o resumo executivo do período |

Diagnóstico e Vendedores não dependem um do outro, então rodam em paralelo.

## Decisões de projeto

- **Os agentes recebem agregados, não pedidos crus.** `scripts/build_data.py` transforma os ~100 mil pedidos em ~70 KB de indicadores por período, estado, etapa e vendedor. O prompt fica pequeno, barato e o modelo não precisa fazer conta.
- **Detecção por regra, julgamento por IA.** "O atraso dobrou?" é uma comparação. A IA entra onde há interpretação: causa, priorização, recomendação e texto.
- **Culpa no lugar certo.** O agente de Vendedores olha o percentual de postagem fora do limite antes de apontar um vendedor. Na crise de 2018, a maioria dos vendedores com atraso alto postou no prazo: o problema era o transporte para fora de SP.
- **Saída estruturada.** Cada agente devolve JSON tipado, e a interface desenha cada resultado no formato certo.
- **Site estático.** Publicado no GitHub Pages. Os agentes rodam no navegador: no modo simulado (padrão) usam lógica local; com uma chave da API da Anthropic, usam o Claude.

## Rodando

```bash
npm install
npm run dev
```

Para regenerar os dados, baixe os CSVs da Olist e rode:

```bash
python3 scripts/build_data.py caminho/para/os/csvs
```

Para usar o Claude, clique em "Usar o Claude com a minha chave" e informe uma chave da API da Anthropic. Ela fica só no navegador de quem usa e vai direto para a API.

## Stack

Next.js 15 (export estático), TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Anthropic SDK, pandas. Tema claro e escuro.
