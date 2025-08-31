import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { conversationManager } from './conversation-manager';

const MODEL = 'google/gemini-2.0-flash-001';

// Check for API key on module load
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.warn('⚠️  OPENROUTER_API_KEY environment variable not found!');
  console.warn('💡 Set OPENROUTER_API_KEY to enable AI responses');
}

const openrouter = createOpenRouter({
  apiKey: apiKey,
});

/**
 * Generate AI response with conversation context
 */
export const generateResponseWithOpenRouter = async (
  userId: string,
  userSpeech: string,
  extraContext: string = '',
  abortSignal?: AbortSignal
): Promise<string> => {
  try {
    // Check for cancellation before starting
    if (abortSignal?.aborted) {
      console.log('🚫 AI generation cancelled before starting');
      throw new Error('AI generation was cancelled');
    }

    // Check if API key is available
    if (!apiKey) {
      console.warn('🚫 AI response skipped - OPENROUTER_API_KEY not configured');
      return "I'm sorry, but AI responses are not available right now. Please check the server configuration.";
    }
    // Add user message to conversation history
    conversationManager.addUserMessage(userId, userSpeech);

    // Get conversation context
    const conversationContext = conversationManager.getConversationContext(userId);

    // Build system prompt with context
    let systemPrompt = `You are a helpful assistant with the goal of conversing with the user. You will be given the user's speech and you will need to respond to them in a natural and engaging way.

Keep your responses conversational and natural, as if you're having a real-time voice conversation. Avoid overly formal language or robotic responses.`;

    if (extraContext) {
      systemPrompt += `\n\nAdditional context: ${extraContext}`;
    }

    // Combine system prompt with conversation context
    const fullPrompt = `${systemPrompt}${conversationContext}\n\nUser: ${userSpeech}\n\nAssistant:`;

    // Set up abort signal listener
    const abortPromise = new Promise<never>((_, reject) => {
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          console.log('🚫 AI generation cancelled during processing');
          reject(new Error('AI generation was cancelled'));
        });
      }
    });

    // Race between AI generation and cancellation
    const { text } = await Promise.race([
      generateText({
        model: openrouter.chat(MODEL),
        prompt: fullPrompt,
        temperature: 0.7, // Add some creativity for more natural responses
      }),
      abortPromise
    ]);

    // Add assistant response to conversation history
    conversationManager.addAssistantMessage(userId, text);

    return text;

  } catch (error) {
    console.error('Error generating AI response:', error);

    // Return a fallback response without storing it in conversation
    const fallbackResponse = "I'm sorry, I couldn't process that right now. Could you try again?";
    return fallbackResponse;
  }
};

/**
 * Get conversation history for a user
 */
export const getConversationHistory = (userId: string, limit: number = 20) => {
  return conversationManager.getConversationHistory(userId, limit);
};

/**
 * Clear conversation history for a user
 */
export const clearConversationHistory = (userId: string) => {
  conversationManager.clearConversation(userId);
};

/**
 * Get conversation statistics
 */
export const getConversationStats = () => {
  return conversationManager.getStats();
};