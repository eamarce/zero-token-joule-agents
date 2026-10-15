namespace zt;

// ---------------------------------------------------------------------------
// The toy business domain: a mailbox of supplier emails and the "ERP" tables
// the agent writes to. All data is synthetic (data/mailbox.json).
// ---------------------------------------------------------------------------

entity Suppliers {
  key ID           : String(20);
      name         : String(100);
      email_domain : String(100);
}

entity Emails {
  key ID            : String(20);   // msg-1001
      seq           : Integer;      // arrival order
      sender        : String(200);
      subject       : String(200);
      body          : LargeString;
      received_at   : Timestamp;
      processed     : Boolean default false;
      // Ground truth for the synthetic mailbox. The agent never reads it; the
      // scoreboard uses it to count wrong answers that nobody noticed.
      expected_json : LargeString;
}

entity Orders {
  key ID             : UUID;
      supplier_id    : String(20);
      order_no       : String(40);
      order_date     : Date;
      total          : Decimal(15, 2);
      currency       : String(3);
      source_message : String(20);
      run            : Association to Runs;
      created_at     : Timestamp;
}

entity Replies {
  key ID         : UUID;
      message_id : String(20);
      text       : LargeString;
      run        : Association to Runs;
      created_at : Timestamp;
}

// ---------------------------------------------------------------------------
// What the agent did. One Runs row per case, in the shape of the run log
// (schema/run-log.schema.json), so the calculator can read this agent's own
// history the same way it reads anyone else's.
// ---------------------------------------------------------------------------

entity Runs {
  key ID               : String(20);  // run-0001
      seq              : Integer;
      message_id       : String(20);
      task             : String(60);  // parse_order_email | reply_to_supplier
      subject_key      : String(100); // sender domain: one playbook per supplier template
      route            : String(20);  // explore | fallback | playbook | frozen | recheck
      run_type         : Integer;     // 1, 2 or 3, computed from tokens and playbook
      path             : String(200); // tool names in order
      playbook         : Association to Playbooks;
      playbook_version : Integer;
      tokens_input     : Integer default 0;
      tokens_output    : Integer default 0;
      model_calls      : Integer default 0;
      tokens_estimated : Boolean default false;
      model            : String(60);
      status           : String(20);  // clean | failed
      shadow_match     : Boolean;     // Type 2 only: did the candidate code agree with the model?
      wrong            : Boolean;     // synthetic oracle: the answer differs from the ground truth
      note             : String(500);
      output_json      : LargeString;
      started_at       : Timestamp;
      finished_at      : Timestamp;
      tool_calls       : Composition of many ToolCalls on tool_calls.run = $self;
}

entity ToolCalls {
  key run         : Association to Runs;
  key seq         : Integer;
      name        : String(60);
      input_json  : LargeString;
      output_json : LargeString;
      error       : String(500);
      duration_ms : Integer;
}

// Every model call, including the ones that are not part of a run: writing a
// candidate extractor costs tokens too, and the ratio should not hide it.
entity ModelCalls {
  key ID            : UUID;
      run           : Association to Runs;
      playbook      : Association to Playbooks;
      purpose       : String(20);  // explore | interpret | recheck | propose
      model         : String(60);
      tokens_input  : Integer;
      tokens_output : Integer;
      estimated     : Boolean;
      at            : Timestamp;
}

// ---------------------------------------------------------------------------
// Crystallization: what the agent proposes, what the gates allow, who signed.
// ---------------------------------------------------------------------------

entity Playbooks {
  key ID                  : UUID;
      name                : String(120);
      task                : String(60);
      subject_key         : String(100);
      version             : Integer;
      // proposed -> rejected | playbook (gate 1) -> eligible -> frozen (gate 2, signed) -> demoted
      status              : String(20);
      steps               : String(200);  // the tool path the playbook replays
      extractor_source    : LargeString;  // model-written code, run only in the sandbox
      proposed_from       : Integer;      // runs the proposal was built from
      backtest_compared   : Integer;
      backtest_matched    : Integer;
      backtest_json       : LargeString;
      streak              : Integer default 0; // clean Type 2 runs in a row where the code agreed with the model
      streak_needed       : Integer;
      frozen_runs         : Integer default 0;
      shadow_failures     : Integer default 0; // Type 2: runs where the shadow code disagreed with the model
      first_failure_seq   : Integer;           // run seq of the first disagreement in this version
      rechecks            : Integer default 0;
      recheck_failures    : Integer default 0;
      max_disagreements   : Integer;
      signed_by           : String(100);
      signed_at           : Timestamp;
      signature_statement : String(500);
      closed_at_seq       : Integer;  // run seq when it was rejected or demoted; a new proposal needs runs after this
      created_at          : Timestamp;
      decisions           : Composition of many Decisions on decisions.playbook = $self;
}

// Append-only history. A playbook's status is the result of these decisions.
entity Decisions {
  key ID           : UUID;
      playbook     : Association to Playbooks;
      action       : String(30);   // propose | backtest | gate1 | eligible | sign | reject | recheck | demote
      actor        : String(100);  // a person's user id, or system:<step>
      from_status  : String(20);
      to_status    : String(20);
      rationale    : String(1000);
      details_json : LargeString;
      at           : Timestamp;
}

// ---------------------------------------------------------------------------
// A2A transport state (Joule and other agent clients).
// ---------------------------------------------------------------------------

entity A2ATasks {
  key ID            : UUID;
      context_id    : String(100);
      state         : String(20);   // completed | failed
      request_text  : LargeString;
      response_text : LargeString;
      run_id        : String(20);
      caller        : String(100);
      created_at    : Timestamp;
}
