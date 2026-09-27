import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "your_gemini_api_key_here") {
        console.error(
            "❌ BŁĄD: Nie znaleziono klucza GEMINI_API_KEY w pliku .env",
        );
        console.error(
            "Upewnij się, że utworzyłeś plik .env z linijką: GEMINI_API_KEY=twoj_klucz",
        );
        process.exit(1);
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    console.log(`📡 Sprawdzam połączenie z Google Gemini (${modelName})...`);

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: modelName,
            contents: "Odpowiedz dokładnie jednym słowem: PONG",
        });

        const reply = response.text?.trim() || "";
        console.log(`✅ Sukces! Gemini działa i odpowiedział: "${reply}"`);
        console.log("Twój klucz API jest poprawny i aktywny.");
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Błąd połączenia z Gemini API: ${errorMsg}`);
        process.exit(1);
    }
}

main();
