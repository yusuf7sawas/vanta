exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing an API key. Set GROQ_API_KEY in Netlify." }),
    };
  }

  try {
    const { messages } = JSON.parse(event.body);

    // Detect if any message has an image attached, to pick a vision-capable model
    const hasImage = messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image")
    );
    const model = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    // Convert our {role, content} messages into OpenAI-compatible format Groq expects
    const groqMessages = [
      {
        role: "system",
        content:
          "You are Vanta, a professional AI assistant. Reply in the same language the user writes in. Be concise, direct, and useful.",
      },
      ...messages.map((m) => {
        if (Array.isArray(m.content)) {
          const parts = [];
          for (const block of m.content) {
            if (block.type === "text") parts.push({ type: "text", text: block.text });
            if (block.type === "image") {
              parts.push({
                type: "image_url",
                image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
              });
            }
            if (block.type === "document") {
              parts.push({ type: "text", text: "(A PDF was attached. PDF analysis isn't supported by this free backend yet — describe what's in it if you can, or ask the user to paste the text.)" });
            }
          }
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      }),
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: groqMessages,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    if (data.error) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error }) };
    }

    const text = data?.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      body: JSON.stringify({ content: [{ type: "text", text }] }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
