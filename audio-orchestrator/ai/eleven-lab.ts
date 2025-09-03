import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import dotenv from "dotenv";

dotenv.config();

// Check for API key on module load
const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenlabsApiKey) {
  console.warn('⚠️  ELEVENLABS_API_KEY environment variable not found!');
  console.warn('💡 Set ELEVENLABS_API_KEY to enable text-to-speech functionality');
}

export const elevenlabs = new ElevenLabsClient({
    apiKey: elevenlabsApiKey,
});

// TTS Configuration
// const DEFAULT_VOICE_ID = "zmcVlqmyk3Jpn5AVYcAL"; // Rachel voice
const DEFAULT_VOICE_ID = "5kMbtRSEKIkRZSdXxrZg"; // Jason voice
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_LANGUAGE_CODE = "en";

/**
 * Generate and stream text-to-speech audio
 */
export const generateTTS = async (
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
  modelId: string = DEFAULT_MODEL_ID,
  languageCode: string = DEFAULT_LANGUAGE_CODE
): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> => {
  try {
    console.log(`🔊 Generating TTS for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    const audio: ReadableStream<Uint8Array<ArrayBufferLike>> = await elevenlabs.textToSpeech.convert(voiceId, {
      text: text,
      modelId: modelId,
      outputFormat: "mp3_44100_128",
      languageCode: languageCode,
      voiceSettings: {
        speed: 0.9,
        stability: 0.8
      },
    });

    console.log(`✅ TTS generated successfully for voice: ${voiceId}`);
    return audio;
  } catch (error) {
    console.error('❌ TTS generation failed:', error);
    throw new Error(`TTS generation failed: ${error}`);
  }
};

/**
 * Check if TTS is available (API key configured)
 */
export const isTTSAvailable = (): boolean => {
  const available = !!elevenlabsApiKey;
  console.log(`🎵 TTS Availability Check: ${available} (API key ${available ? 'present' : 'missing'})`);
  if (!available) {
    console.log('💡 To enable TTS, set ELEVENLABS_API_KEY environment variable');
    console.log('   Example: export ELEVENLABS_API_KEY=your_api_key_here');
    console.log('   Or create a .env file with: ELEVENLABS_API_KEY=your_api_key_here');
  }
  return available;
};
