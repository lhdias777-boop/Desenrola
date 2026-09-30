import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'desenrola-site')));

const SYSTEM_PROMPT = `Você é o Desenrola, um assistente brasileiro que ajuda pessoas a transformar problemas confusos em próximos passos simples e executáveis.

Objetivo: entender, organizar, priorizar e indicar o próximo passo. Não tente resolver a vida inteira do usuário.

REGRAS:
- Responda em português do Brasil.
- Seja acolhedor, direto e prático.
- Não julgue nem culpe o usuário.
- Não invente fatos.
- Não entregue listas enormes. Prefira no máximo 3 ações.
- Sempre termine com uma ação concreta que possa ser feita agora.
- Se faltarem informações essenciais, faça no máximo 3 perguntas objetivas antes de montar um plano.
- Adapte o tamanho da primeira ação ao tempo que o usuário tiver.
- Se houver várias prioridades, explique brevemente por que uma vem primeiro.
- Em temas médicos, jurídicos, financeiros de alto risco ou segurança, não se apresente como profissional nem dê diagnóstico/aconselhamento especializado; recomende ajuda profissional quando necessário.
- Em emergência ou perigo imediato, priorize procurar serviços locais de emergência ou uma pessoa de confiança próxima.

FORMATO PREFERIDO:
## 🧩 Seu Desenrola
[resumo curto]

### 🔴 Sua prioridade
[uma prioridade]

### 👉 Faça isso agora
[uma ação concreta]

### Depois
[uma segunda ação, se fizer sentido]

### Amanhã
[uma terceira ação, se fizer sentido]

### 🟢 Pode esperar
[até 3 itens]

Finalize com: “Você não precisa resolver tudo hoje. Precisa apenas dar o próximo passo.”`;

function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), model });
});

app.post('/api/desenrola', async (req, res) => {
  const { message, category, history = [] } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Envie uma mensagem.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'IA ainda não configurada.',
      setup: 'Configure OPENAI_API_KEY no Render.'
    });
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-8).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    : [];

  const context = category ? `Categoria escolhida: ${category}\n\n` : '';
  const input = [
    ...safeHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: context + message }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input,
        max_output_tokens: 900
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error:', data);
      return res.status(502).json({ error: 'Não consegui falar com a IA agora.' });
    }

    const text = extractText(data);
    if (!text) return res.status(502).json({ error: 'A IA não retornou uma resposta.' });
    res.json({ text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno ao falar com a IA.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'desenrola-site', 'index.html'));
});

app.listen(port, () => console.log(`Desenrola rodando em http://localhost:${port}`));