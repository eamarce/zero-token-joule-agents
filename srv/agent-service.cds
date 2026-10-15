using zt from '../db/schema';

type TypeRow {
  type       : Integer;
  runs       : Integer;
  share      : Decimal(5, 4);
  tokens     : Integer;
  tokenShare : Decimal(5, 4);
  meanTokens : Integer;
}

type RatioResult {
  ratio          : String;   // "21 : 14 : 66"
  total          : Integer;
  allTokens      : Integer;
  proposalTokens : Integer;  // spent writing candidate code, outside any run
  wrongServed    : Integer;  // synthetic oracle: wrong answers nobody caught at the time
  rows           : many TypeRow;
  profile        : String;
  model          : String;
}

type RunResult {
  runId     : String;
  messageId : String;
  task      : String;
  route     : String;
  runType   : Integer;
  tokens    : Integer;
  estimated : Boolean;
  status    : String;
  summary   : String;
  note      : String;
  events    : many String;  // what the crystallizer did after this run
  ratio     : String;
}

/**
 * The agent, its history and its governance.
 * Reading needs a logged-in user. Running the agent needs AgentCaller.
 * Signing or rejecting a playbook needs Approver, and the signer must be a person.
 */
@path    : '/odata/v4/agent'
@impl    : 'srv/agent-service.js'
@requires: 'authenticated-user'
service AgentService {

  @readonly entity Emails     as projection on zt.Emails excluding { expected_json };
  @readonly entity Runs       as projection on zt.Runs;
  @readonly entity ToolCalls  as projection on zt.ToolCalls;
  @readonly entity ModelCalls as projection on zt.ModelCalls;
  @readonly entity Playbooks  as projection on zt.Playbooks;
  @readonly entity Decisions  as projection on zt.Decisions;
  @readonly entity Orders     as projection on zt.Orders;
  @readonly entity Replies    as projection on zt.Replies;
  @readonly entity Suppliers  as projection on zt.Suppliers;

  /** Process the next unprocessed email in the mailbox. */
  @requires: 'AgentCaller'
  action   processNext()                                   returns RunResult;

  /** Process one email by id, e.g. msg-1007. Re-processing an email is allowed. */
  @requires: 'AgentCaller'
  action   process(messageId : String)                     returns RunResult;

  /** Gate 2: a named person signs an eligible playbook. From then on it runs with no model. */
  @requires: 'Approver'
  action   sign(playbook : UUID, statement : String)       returns String;

  /** Stop a playbook at any stage. Its cases go back to the model. */
  @requires: 'Approver'
  action   rejectPlaybook(playbook : UUID, rationale : String) returns String;

  /** Wipe runs, orders, replies and playbooks and reload the mailbox. Disabled in production. */
  @requires: 'Approver'
  action   reset()                                         returns String;

  function ratio()                                         returns RatioResult;

  /** Mode, thresholds, mailbox position and playbooks, as one JSON document. */
  function status()                                        returns LargeString;

  /** This agent's runs as run-log JSONL (schema/run-log.schema.json). */
  function exportRunLog()                                  returns LargeString;
}

/**
 * The opportunity calculator: point it at a run log (yours, or this agent's)
 * and it shows the Type 1 : 2 : 3 ratio and which paths are worth freezing.
 * It is deterministic. It calls no model and needs no API key.
 */
@path    : '/odata/v4/calculator'
@impl    : 'srv/calculator-service.js'
@requires: 'authenticated-user'
service CalculatorService {
  /**
   * content: the file's text. format: runlog | otel | auto.
   * options: optional JSON { minRepeats, minPathShare, minTokens, pricePerMTok, answers: { "<task> <path>": { owner, test, fallback, audit_required } } }
   */
  action analyze(content : LargeString, format : String, options : LargeString) returns LargeString;

  /** A sample log to try the calculator with. format: runlog | otel */
  function sample(format : String)                                          returns LargeString;
}

// UI annotations, one file per app
using from './annotations/runs-ui';
using from './annotations/playbooks-ui';
