import {
  convertToModelMessages,
  pruneMessages,
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
  type UIMessage,
} from 'ai';

/**
 * Pruning uses model-message content; UI messages carry their content in parts.
 * Reasoning is dropped from history: Anthropic binds signed thinking blocks to the system prompt and tool list
 * they were created with, and Bolt rebuilds both every request, so replaying them fails with a 400.
 */
export async function prepareModelMessages(messages: UIMessage[]) {
  return pruneMessages({
    messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
    reasoning: 'all',
  });
}

/**
 * The agent loop's prepareStep also changes the system prompt and active tools between steps of one request,
 * so reasoning produced by an earlier step is just as invalid in the next step's prompt. Removing every thinking
 * block keeps the request valid (removing all of them is an allowed edit; removing some from the middle is not).
 */
export const dropReplayedReasoning: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  transformParams: async ({ params }) => ({
    ...params,
    prompt: params.prompt.map((message) =>
      message.role === 'assistant'
        ? { ...message, content: message.content.filter((part) => part.type !== 'reasoning') }
        : message,
    ),
  }),
};

export function withoutReplayedReasoning(model: LanguageModel) {
  if (typeof model === 'string') {
    return model;
  }

  return wrapLanguageModel({ model, middleware: dropReplayedReasoning });
}
