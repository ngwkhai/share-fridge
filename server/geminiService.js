// Google Gemini 2.5 Flash Integration Service

const DEFAULT_KEY = process.env.GEMINI_API_KEY || '';

export async function callGeminiApi(prompt, systemInstruction = '', customApiKey = '') {
  const apiKey = customApiKey || DEFAULT_KEY;
  if (!apiKey) {
    return null; // Signals fallback to heuristic
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json'
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn('Gemini API returned error status:', res.status, errorText);
      return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn('Gemini API invocation failed, falling back:', err.message);
    return null;
  }
}

export async function suggestRecipesWithGemini(foods, preference = '', customApiKey = '') {
  const urgentItems = foods.filter(f => f.status === 'COOK_SOON' || f.status === 'EXPIRED');
  const freshItems = foods.filter(f => f.status === 'FRESH');

  const foodDescriptions = [
    ...urgentItems.map(f => `[GẤP - CÒN ${f.days_remaining} NGÀY]: ${f.name} (${f.quantity || '1 phần'}, ${f.compartment})`),
    ...freshItems.map(f => `[ĐỒ CÒN HẠN]: ${f.name} (${f.quantity || '1 phần'}, ${f.compartment})`)
  ].join('\n');

  const prompt = `Dưới đây là danh sách thực phẩm hiện có trong tủ lạnh phòng trọ:
${foodDescriptions || 'Tủ lạnh đang trống.'}

Yêu cầu khẩu vị/ghi chú: ${preference || 'Bữa cơm sinh viên/gia đình Việt Nam, nấu nhanh 15-20 phút, ít dụng cụ.'}

Hãy đề xuất 2 đến 3 món ăn phù hợp nhất. BẮT BUỘC ưu tiên sử dụng các món [GẤP] để không bị hỏng.
Trả về JSON array các món theo cấu trúc:
[
  {
    "id": "rec-1",
    "title": "Tên món ăn thuần Việt",
    "cook_time_minutes": 15,
    "ingredients_used": ["Tên nguyên liệu trong tủ sẽ dùng"],
    "ingredients_missing": ["Gia vị thông thường cần thêm nếu có (ví dụ: Tỏi, Ớt, Nước mắm)"],
    "instructions": [
      "Bước 1: ...",
      "Bước 2: ...",
      "Bước 3: ..."
    ]
  }
]`;

  const systemInstruction = "Bạn là đầu bếp AI thông minh chuyên gợi ý món ăn gia đình/sinh viên Việt Nam tiết kiệm, tận dụng tối đa đồ ăn cận date trong tủ lạnh chung.";

  const aiResult = await callGeminiApi(prompt, systemInstruction, customApiKey);
  if (Array.isArray(aiResult) && aiResult.length > 0) {
    return aiResult;
  }

  // Fallback heuristic if API Key is not set or quota reached
  return fallbackSuggestRecipes(foods);
}

export async function parseVoiceWithGemini(transcript, customApiKey = '') {
  const prompt = `Phân tích câu nói tiếng Việt sau đây khi người dùng nhập thực phẩm vào tủ lạnh:
"${transcript}"

Trả về đúng JSON theo cấu trúc:
{
  "name": "Tên thực phẩm (ví dụ: Thịt ba chỉ, Rau muống)",
  "quantity": "Số lượng nếu có (ví dụ: 500g, 1 mớ, 1 vỉ) hoặc chuỗi rỗng",
  "compartment": "Một trong 5 giá trị chính xác: FREEZER | FRIDGE_TOP | FRIDGE_BOTTOM | CRISPER | DOOR",
  "container_tag": "Đặc điểm nhận diện bao bì nếu có (ví dụ: Túi zip xanh, Hộp Lock nắp trắng, Túi nilon đỏ) hoặc chuỗi rỗng",
  "shelf_life_days": Số_ngày_bảo_quản_phù_hợp (số nguyên từ 1 đến 30)
}`;

  const systemInstruction = "Bạn là trợ lý AI trích xuất thực phẩm tiếng Việt thành JSON có cấu trúc chính xác.";

  const aiResult = await callGeminiApi(prompt, systemInstruction, customApiKey);
  if (aiResult && aiResult.name && aiResult.compartment) {
    return {
      parsed: {
        name: aiResult.name,
        quantity: aiResult.quantity || '',
        compartment: aiResult.compartment,
        container_tag: aiResult.container_tag || '',
        shelf_life_days: Number(aiResult.shelf_life_days) || 3
      },
      confidence: 0.98,
      source: 'gemini-2.5-flash'
    };
  }

  // Fallback rule-based NLP
  return fallbackParseVoice(transcript);
}

// Heuristic Fallback Recipes
function fallbackSuggestRecipes(foods) {
  const foodNames = foods.map(f => f.name.toLowerCase());
  const suggestions = [];

  if (foodNames.some(n => n.includes('thịt') || n.includes('heo') || n.includes('lợn'))) {
    suggestions.push({
      id: 'rec-fallback-1',
      title: 'Thịt rang cháy cạnh ăn kèm cơm nóng',
      cook_time_minutes: 15,
      ingredients_used: foods.filter(f => f.name.toLowerCase().includes('thịt')).map(f => f.name),
      ingredients_missing: ['Hành khô', 'Nước mắm', 'Đường'],
      instructions: [
        'Bước 1: Thịt rửa sạch, thái miếng mỏng vừa ăn.',
        'Bước 2: Cho vào chảo đảo săn lửa lớn đến khi xém cạnh, chắt bớt mỡ.',
        'Bước 3: Thêm hành khô, 1 thìa nước mắm, 1/2 thìa đường đảo đều 2 phút rồi tắt bếp.'
      ]
    });
  }

  if (foodNames.some(n => n.includes('rau') || n.includes('muống') || n.includes('cải'))) {
    suggestions.push({
      id: 'rec-fallback-2',
      title: 'Rau luộc lấy nước làm canh dầm sấu/chanh',
      cook_time_minutes: 10,
      ingredients_used: foods.filter(f => f.name.toLowerCase().includes('rau')).map(f => f.name),
      ingredients_missing: ['Muối', 'Chanh hoặc Sấu'],
      instructions: [
        'Bước 1: Rau nhặt sạch, rửa 2-3 lần nước để ráo.',
        'Bước 2: Đun sôi nước với chút muối, thả rau vào luộc chín tới trong 3-4 phút.',
        'Bước 3: Vớt rau ra đĩa, nước canh để nguội vắt chanh làm canh thanh mát.'
      ]
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'rec-fallback-3',
      title: 'Trứng chiên hành tây hoặc xào cà chua',
      cook_time_minutes: 10,
      ingredients_used: foods.slice(0, 2).map(f => f.name),
      ingredients_missing: ['Trứng gà', 'Dầu ăn', 'Nước mắm'],
      instructions: [
        'Bước 1: Đập trứng vào bát, nêm 1 thìa nước mắm và đánh tan.',
        'Bước 2: Làm nóng dầu trong chảo, đổ trứng vào chiên vàng 2 mặt.',
        'Bước 3: Cho ra đĩa và dùng nóng với cơm.'
      ]
    });
  }

  return suggestions;
}

// Heuristic Fallback Voice Parsing
function fallbackParseVoice(transcript) {
  const text = transcript.toLowerCase();
  let compartment = 'FRIDGE_TOP';
  let shelfDays = 3;
  let containerTag = '';

  if (text.includes('đông') || text.includes('đá') || text.includes('freezer')) {
    compartment = 'FREEZER';
    shelfDays = 14;
  } else if (text.includes('rau') || text.includes('củ') || text.includes('hộc')) {
    compartment = 'CRISPER';
    shelfDays = 2;
  } else if (text.includes('cánh') || text.includes('trứng') || text.includes('sữa')) {
    compartment = 'DOOR';
    shelfDays = 7;
  } else if (text.includes('dưới')) {
    compartment = 'FRIDGE_BOTTOM';
    shelfDays = 3;
  }

  if (text.includes('túi zip xanh')) containerTag = 'Túi zip xanh';
  else if (text.includes('túi zip')) containerTag = 'Túi zip trắng';
  else if (text.includes('túi đỏ') || text.includes('nilon đỏ')) containerTag = 'Túi nilon đỏ';
  else if (text.includes('hộp xanh') || text.includes('lock xanh')) containerTag = 'Hộp Lock xanh';
  else if (text.includes('hộp thủy tinh')) containerTag = 'Hộp thủy tinh';

  const quantityMatch = transcript.match(/(\d+\s*(?:g|kg|lạng|cân|mớ|quả|hộp|vỉ|gói|túi|miếng|bát))/i);
  const quantity = quantityMatch ? quantityMatch[0] : '';

  let name = transcript
    .replace(/(cất|để|ở|ngăn đông|ngăn đá|ngăn mát|hộc rau|cánh tủ|túi zip xanh|túi zip|túi đỏ|hộp xanh|hộp lock)/gi, '')
    .trim();

  return {
    parsed: {
      name: name || transcript,
      quantity,
      compartment,
      container_tag: containerTag,
      shelf_life_days: shelfDays
    },
    confidence: 0.85,
    source: 'heuristic'
  };
}
