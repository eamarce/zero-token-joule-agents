import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';

/**
 * Type 3: the agent explores the case.
 *
 *   START -> agent -> (tool calls?) -> tools -> agent -> ... -> END
 *
 * A plain tool-calling loop in LangGraph. The model decides every step, so
 * every step costs tokens. That is right for a new kind of case and wasteful
 * for the 120th identical one, which is what the rest of this repository is about.
 */
export function buildExploreGraph(model, tools) {
  const callModel = async (state) => ({ messages: [await model.agentStep(state.messages, tools)] });
  const next = (state) => (state.messages.at(-1)?.tool_calls?.length ? 'tools' : END);
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', next, ['tools', END])
    .addEdge('tools', 'agent')
    .compile();
}

/** Run the explore graph on one email. Returns the final messages. */
export async function explore(model, tools, messageId, { maxSteps = 8 } = {}) {
  const graph = buildExploreGraph(model, tools);
  const result = await graph.invoke(
    { messages: [new HumanMessage(`Process email ${messageId}.`)] },
    { recursionLimit: maxSteps * 2 + 1 },
  );
  return result.messages;
}
