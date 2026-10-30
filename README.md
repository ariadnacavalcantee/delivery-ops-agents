# FoodOps AI

Central de operações de delivery em que cinco agentes de IA leem a operação de um pico de jantar, descobrem por que os pedidos estão atrasando e entregam um plano de ação para o gestor.

Os dados são fictícios e gerados de forma determinística: sexta-feira, 19h às 21h, sete zonas de Fortaleza, doze restaurantes, 460 pedidos e 14 dias de histórico. Dentro deles há problemas plantados que os agentes precisam encontrar sozinhos:

- chuva em Parangaba e Messejana derrubando a oferta de entregadores;
- uma cozinha (Brasa do Cocó) que vem piorando há duas semanas;
- um restaurante (Sushi Kaze) que só estoura no pico de hoje;
- um restaurante (Wok Fátima) com atraso crônico escondido por uma noite boa;
- uma pizzaria que marca o pedido como pronto antes da hora e prende entregadores no balcão;
- endereços difíceis de achar no Meireles.

## Os agentes

```
Monitor → [ Diagnóstico ∥ Restaurantes ] → Ações → Relatório
```

| Agente | O que faz | Onde entra a IA |
| --- | --- | --- |
| Monitor | Lê os pedidos e levanta alertas | Regras detectam (rápido e auditável); o modelo prioriza e resume |
| Diagnóstico | Explica por que os pedidos atrasaram | Cruza as etapas do atraso com zonas e restaurantes |
| Restaurantes | Separa problema de hoje de problema crônico | Compara a noite com 14 dias de histórico e desconta a chuva |
| Ações | Transforma diagnóstico em próximos passos | Define ação, responsável, urgência e impacto esperado |
| Relatório | Escreve o resumo para a liderança | Consolida a saída dos outros quatro |

Diagnóstico e Restaurantes não dependem um do outro, então rodam em paralelo.

## Decisões de projeto

- **Os agentes recebem indicadores, não pedidos crus.** Uma camada determinística (`src/lib/analysis.ts`) transforma 460 pedidos em agregados por zona, restaurante e etapa do atraso. O prompt fica pequeno, barato e o modelo não precisa fazer conta.
- **Detecção por regra, julgamento por IA.** "O pedido passou do prazo?" é uma comparação, não precisa de LLM. A IA entra onde há interpretação: causa, priorização, recomendação e texto.
- **Saída estruturada.** Cada agente devolve JSON tipado, então a interface desenha cada resultado do jeito certo (lista de alertas, barra de causas, tabela, quadro de ações, documento) em vez de despejar texto.
- **Streaming.** A rota `/api/run` transmite os eventos de cada agente em NDJSON e a interface mostra o progresso ao vivo.
- **Modo simulado.** Sem chave de API, os agentes usam lógica local que produz o mesmo formato de saída. A demo funciona sempre, e o modo é sinalizado na tela.

## Rodando

```bash
npm install
cp .env.example .env.local   # coloque sua ANTHROPIC_API_KEY para usar o Claude
npm run dev
```

Sem `ANTHROPIC_API_KEY` o app roda em modo simulado.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Anthropic SDK.
