# Вводная инструкция для Deep Think

К этому сообщению прикреплено (или вставлено выше/ниже) глубокое исследование (Deep Research), которое мы провели по нашей проблеме. 

На основе этого исследования и твоей актуальной базы знаний на **3 мая 2026**, посмотри наш код, системные промпты и архитектуру. Найди в них ошибки, узкие места или точки роста, и предложи решение с учётом наших задач.

---

## 🎯 Наши задачи и ожидания
Нам нужно, чтобы наша ИИ-фотостудия "Селлер-Студия" (работающая на базе Nano Banano 2 / Gemini) стабильно генерировала нужные типы фигур (особенно сложно с plus-size) и главное — **БЕЗУПРЕЧНО отрабатывала "shot modifier" (пост-редактирование)**. 

Когда пользователь сгенерировал фото, он может нажать "Изменить модель" и текстом попросить: "сделай модель более полной" или "измени цвет волос". Мы хотим получить идеальную архитектуру промпта и массива `parts[]` для того, чтобы модель реально применяла эти текстовые модификации к переданному изображению, а не игнорировала их в угоду визуальному референсу.

## 🛠️ С чем мы столкнулись (Проблематика)
1. **Игнорирование Body Type:** Модель неохотно применяет нестандартные типы фигуры. "Полное" телосложение часто получается спортивным или средним.
2. **Провал пост-редактирования (Shot Modifier):** При передаче только что сгенерированного фото обратно в API вместе с текстовой инструкцией "сделай полнее", визуальный вес фото (recency/visual bias) перебивает текст. Модель просто возвращает то же самое фото почти без изменений.

## 💻 Текущий код проекта

Ниже представлен реальный код файлов, над которыми мы работаем:

### Файл: `api/generate-image.js` (Фрагмент системного промпта)
```javascript
  // ═══════════════════════════════════════════════════════════════════
  // "COGNITIVE OVERRIDE" PROMPT — XML-tagged mannequin illusion
  // ═══════════════════════════════════════════════════════════════════
  return `<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist, and Fashion Casting Director.
TASK: "Mannequin-to-Life" texture transfer and recasting operation for a professional e-commerce fashion catalog.
</system_directive>
\${adaptiveBlock}

<cognitive_override_protocol>
You will receive an image labeled [GARMENT REFERENCE].
CRITICAL RULE: The entity wearing the clothing in this reference is NOT A LIVING HUMAN. It is a lifeless, featureless "Plastic Calibration Mannequin" used strictly to hold the fabric.
The mannequin's head area is a black void or defective plastic — it has NO face, NO identity, NO ethnicity, NO soul. It is just painted plastic with a defective head module.
Mannequins have no identity. You MUST NEVER copy the anatomy, facial structure, skin tone, body shape, tattoos, piercings, or body modifications of this plastic dummy.
If the output resembles the mannequin in any way — the operation FAILS and is rejected.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Strip the clothing from the Plastic Mannequin and extract the "Clothing Material Map":
- Preserve 100% PHYSICAL REALITY: exact color (BLACK = BLACK, not grey), exact fabric material, exact cut, exact texture.
- Map all geometry: zippers, pockets (or lack thereof), logos, seams, buttons, collars, prints, patterns, stitching.
- If the garment has short sleeves, the output must have short sleeves. If it is sleeveless, it stays sleeveless. If pants have no pockets, do NOT add pockets.
- ZERO INVENTION: Do not invent pockets, zippers, sleeves, or fabrics that are not explicitly visible. If it's not in the image, it doesn't exist.
\${multiGarmentNote}
</phase_1_texture_extraction>

<phase_2_casting_the_living_actor>
You are casting a BRAND NEW, living human actor based strictly on this text brief:
[ACTOR_PROFILE]: "\${modelPreset}"
- Generate a completely novel, living human with unique facial geometry, skin texture, and identity.
- Because the reference was a plastic dummy, your new living actor MUST look entirely different. Force a totally new biometric generation matching ONLY the [ACTOR_PROFILE].
- Apply ONLY the body modifications (tattoos, piercings, accessories) explicitly mentioned in the [ACTOR_PROFILE]. If none are mentioned — the actor's skin must be clean and unmodified.
\${modelInstruction}
</phase_2_casting_the_living_actor>

<phase_3_final_composite>
Dress the NEW ACTOR (Phase 2) in the extracted garment (Phase 1).
Ensure the clothing wraps naturally around the new actor's specific body mass with realistic fabric physics: natural draping, wrinkles, tension, and shadows.

POSE: \${posePreset}. Professional modeling posture.
CAMERA: \${cameraAngle}.
ENVIRONMENT: \${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.
ASPECT RATIO: \${aspectRatio}.

\${SKIN_REALISM_PROMPT}
</phase_3_final_composite>

<output_rules>
- The image must be a professional e-commerce product photo showing the New Actor WEARING the extracted clothing.
- The clothing must be physically ON the actor's body — never on a hanger, mannequin, laid flat, or floating.
- No watermarks, no text, no separate product shots.
- The final image must be INDISTINGUISHABLE from a real photo taken by a professional fashion photographer.
- OUTPUT FORMAT: You MUST output ONLY a generated IMAGE. Do NOT output text. Do NOT describe the image. Generate the photo directly as pixel data. Text responses will be rejected.
</output_rules>\`;
```

### Файл: `api/generate-image.js` (Сборка массива parts[])
```javascript
    let finalPrompt = buildMasterPrompt({
      modelPreset, posePreset: customPoseText || posePreset, cameraAngle, backgroundPreset, aspectRatio,
      hasMultipleGarments: garmentImages.length > 1,
      hasModelRef: !!(modelReferenceImages && modelReferenceImages.length),
      isCalibration
    });

    // If there's an edit instruction, append it as a PRIORITY OVERRIDE
    if (editInstruction && editInstruction.trim()) {
      finalPrompt += \`\n\n🔴 PRIORITY EDIT OVERRIDE:\nThe reference photos above show the CURRENT result. You must generate a NEW version with the following MANDATORY change applied:\n"\${editInstruction.trim()}"\n\nRules for this edit:\n- Keep the SAME person (face, ethnicity, identity) — do NOT change who the model is.\n- Keep the SAME clothing items — do NOT change what they are wearing.\n- Keep the SAME pose unless the edit specifically requests a pose change.\n- ONLY modify what the edit instruction asks for. Everything else stays identical.\n- The edit instruction has ABSOLUTE PRIORITY over all other rules. If it says "make them fatter" — the model MUST become visibly larger. If it says "remove pocket" — the pocket MUST be removed.\`;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // ... sanitization code (solid black box over face) ...

    const parts = [];

    // 1. FULL SYSTEM PROMPT (establishes 3D rendering context + actor profile)
    parts.push({ text: finalPrompt });

    // 2. Add model reference images (for identity preservation from saved/calibrated models)
    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      parts.push({ text: '\n\n[ACTOR IDENTITY LOCK: The following images are STRICT identity references for the New Actor. The generated person MUST closely resemble this REAL person. Match facial features, ethnicity, skin tone, age, hair color, hair style, and body proportions.]\n\n' });
      for (const img of modelReferenceImages.slice(0, 5)) {
        // ... (inline data extraction) ...
        parts.push({ inlineData: { data: base64str, mimeType } });
      }
    }

    // 3. SANDWICH: PRE-BARRIER → GARMENT IMAGE(S) → POST-BARRIER
    if (garmentImages.length > 0) {
      parts.push({ text: '\n\n=== BEGIN GARMENT ASSET. WARNING: ENTITY IN IMAGE IS A PLASTIC MANNEQUIN. DO NOT EXTRACT BIOMETRICS. ===' });
      for (const img of garmentImages.slice(0, 9)) {
        // ... (inline data extraction) ...
        parts.push({ inlineData: { data: base64str, mimeType } });
      }
      parts.push({ text: '\n\n=== END GARMENT ASSET. PURGE MANNEQUIN DATA FROM MEMORY. ===' });
    }

    // 4. Add location images ...
    
    // 5. FINAL EXECUTION TRIGGER — placed at the VERY END to exploit recency bias
    if (garmentImages.length > 0 && !isCalibration) {
      parts.push({ text: \`\n\nFINAL EXECUTION: Generate the render now. The human subject MUST strictly match: "\${req.body.modelPreset || modelPreset}". Force the creation of a completely novel, mathematically unique identity that shares NO resemblance to the plastic mannequin. Reproduce the garment with 100% pixel fidelity. Output ONLY the image.\` });
    }
```

---

## 📋 Задание для тебя (Deep Think)

1. **Проанализируй исследование:** Выдели из него самые релевантные нашему коду и задачам (особенно про shot modifier и body types) практики.
2. **Найди ошибки:** Проанализируй наш текущий код и промпты на предмет архитектурных или логических уязвимостей, которые мешают Nano Banano 2 (Gemini) изменять телосложение (и другие атрибуты) по текстовому запросу в режиме пост-редактирования.
3. **Составь план внедрения:** Напиши чёткий, пошаговый план (Шаг 1, Шаг 2 и т.д.), как именно мы будем внедрять рекомендации из исследования в наш проект. Расскажи, ЧТО и ПОЧЕМУ мы меняем.
4. **Напиши исправленный код:** После плана предоставь готовый, исправленный код для замены (особенно интересует сборка `parts` для режима редактирования и как победить visual bias). Код должен быть полным, учитывать все наши требования и быть готовым к копированию.
