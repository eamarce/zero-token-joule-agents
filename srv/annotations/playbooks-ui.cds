using { AgentService as srv } from '../agent-service';

// ---------------------------------------------------------------------------
// Playbooks app (app/playbooks): worklist + object page in a flexible column layout.
// Texts are i18n keys with the prefix "playbooks." (srv/_i18n/i18n.properties).
// ---------------------------------------------------------------------------

// Read-only helper columns for the UI. They derive from the stored status; they do not
// change what the service stores, and the existing actions keep their signatures.
extend srv.Playbooks with columns {
  case status
    when 'frozen'   then 3   // positive
    when 'eligible' then 2   // critical: waits for a person
    when 'playbook' then 2
    when 'proposed' then 5   // information
    when 'rejected' then 1   // negative
    when 'demoted'  then 1
    else 0
  end as statusCriticality : Integer,

  case when status = 'eligible' then true else false end as canSign : Boolean,

  case when status in ('proposed', 'playbook', 'eligible', 'frozen') then true else false end as canReject : Boolean,

  case when signed_by is null then false else true end as isSigned : Boolean,

  cast(backtest_matched as String(10)) || ' / ' || cast(backtest_compared as String(10)) as backtestText : String(30)
};

// Bound actions for the Approver. They delegate to the same logic as the unbound
// sign / rejectPlaybook actions (srv/agent-service.js); those two stay as they are.
extend srv.Playbooks with actions {
  @requires: 'Approver'
  action signPlaybook(statement : String) returns srv.Playbooks;

  @requires: 'Approver'
  action declinePlaybook(rationale : String) returns srv.Playbooks;
};

annotate srv.Playbooks actions {
  signPlaybook    @(Common.Label: '{i18n>playbooks.Sign}',   Core.OperationAvailable: canSign);
  declinePlaybook @(Common.Label: '{i18n>playbooks.Reject}', Core.OperationAvailable: canReject);
};

annotate srv.Playbooks with actions {
  signPlaybook(
    statement @(
      Common.Label        : '{i18n>playbooks.Statement}',
      Common.QuickInfo    : '{i18n>playbooks.StatementHelp}',
      Common.FieldControl : #Mandatory,
      UI.MultiLineText
    )
  );
  declinePlaybook(
    rationale @(
      Common.Label        : '{i18n>playbooks.Rationale}',
      Common.QuickInfo    : '{i18n>playbooks.RationaleHelp}',
      Common.FieldControl : #Mandatory,
      UI.MultiLineText
    )
  );
};

// After an action, refresh the history and the evidence of the same playbook.
annotate srv.Playbooks actions {
  signPlaybook @(Common.SideEffects: {
    TargetEntities : [in.decisions],
    TargetProperties: [
      'status', 'statusCriticality', 'canSign', 'canReject', 'isSigned',
      'signed_by', 'signed_at', 'signature_statement'
    ]
  });
  declinePlaybook @(Common.SideEffects: {
    TargetEntities : [in.decisions],
    TargetProperties: ['status', 'statusCriticality', 'canSign', 'canReject', 'closed_at_seq']
  });
};

annotate srv.Playbooks with @(
  Common.Label: '{i18n>playbooks.Playbooks}',

  Capabilities: {
    InsertRestrictions : { Insertable: false },
    UpdateRestrictions : { Updatable: false },
    DeleteRestrictions : { Deletable: false }
  },

  // ---- Header ------------------------------------------------------------
  UI.HeaderInfo: {
    TypeName       : '{i18n>playbooks.Playbook}',
    TypeNamePlural : '{i18n>playbooks.Playbooks}',
    Title          : { $Type: 'UI.DataField', Value: subject_key },
    Description    : { $Type: 'UI.DataField', Value: task },
    TypeImageUrl   : 'sap-icon://program-triangles'
  },

  UI.DataPoint #status: {
    Title       : '{i18n>playbooks.Status}',
    Value       : status,
    Criticality : statusCriticality
  },
  UI.DataPoint #version: {
    Title : '{i18n>playbooks.Version}',
    Value : version
  },
  UI.DataPoint #backtest: {
    Title         : '{i18n>playbooks.Backtest}',
    Value         : backtest_matched,
    TargetValue   : backtest_compared,
    Visualization : #Progress
  },
  UI.DataPoint #streak: {
    Title         : '{i18n>playbooks.Gate2Streak}',
    Value         : streak,
    TargetValue   : streak_needed,
    Visualization : #Progress
  },
  UI.DataPoint #frozenRuns: {
    Title : '{i18n>playbooks.FrozenRuns}',
    Value : frozen_runs
  },

  UI.FieldGroup #signature: {
    Data: [
      { $Type: 'UI.DataField', Value: signed_by,           Label: '{i18n>playbooks.SignedBy}' },
      { $Type: 'UI.DataField', Value: signed_at,           Label: '{i18n>playbooks.SignedAt}' },
      { $Type: 'UI.DataField', Value: signature_statement, Label: '{i18n>playbooks.Statement}' }
    ]
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', ID: 'hStatus',    Target: '@UI.DataPoint#status' },
    { $Type: 'UI.ReferenceFacet', ID: 'hVersion',   Target: '@UI.DataPoint#version' },
    { $Type: 'UI.ReferenceFacet', ID: 'hBacktest',  Target: '@UI.DataPoint#backtest' },
    { $Type: 'UI.ReferenceFacet', ID: 'hStreak',    Target: '@UI.DataPoint#streak' },
    { $Type: 'UI.ReferenceFacet', ID: 'hFrozen',    Target: '@UI.DataPoint#frozenRuns' },
    { $Type: 'UI.ReferenceFacet', ID: 'hSignature', Target: '@UI.FieldGroup#signature', Label: '{i18n>playbooks.Signature}', ![@UI.Hidden]: (isSigned = false) }
  ],

  // ---- Actions in the object page header (Approver only; enablement by status) -----
  UI.Identification: [
    {
      $Type              : 'UI.DataFieldForAction',
      Action             : 'AgentService.signPlaybook',
      Label              : '{i18n>playbooks.Sign}',
      Criticality        : #Positive,
      ![@UI.Emphasized]  : true
    },
    {
      $Type       : 'UI.DataFieldForAction',
      Action      : 'AgentService.declinePlaybook',
      Label       : '{i18n>playbooks.Reject}',
      Criticality : #Negative
    }
  ],

  // ---- Object page sections ------------------------------------------------
  UI.FieldGroup #gate1: {
    Data: [
      { $Type: 'UI.DataField', Value: name,              Label: '{i18n>playbooks.Name}' },
      { $Type: 'UI.DataField', Value: steps,             Label: '{i18n>playbooks.Steps}' },
      { $Type: 'UI.DataField', Value: proposed_from,     Label: '{i18n>playbooks.ProposedFrom}' },
      { $Type: 'UI.DataField', Value: backtest_matched,  Label: '{i18n>playbooks.BacktestMatched}' },
      { $Type: 'UI.DataField', Value: backtest_compared, Label: '{i18n>playbooks.BacktestCompared}' },
      { $Type: 'UI.DataField', Value: created_at,        Label: '{i18n>playbooks.ProposedAt}' }
    ]
  },
  UI.FieldGroup #gate2: {
    Data: [
      { $Type: 'UI.DataField', Value: streak,            Label: '{i18n>playbooks.Streak}' },
      { $Type: 'UI.DataField', Value: streak_needed,     Label: '{i18n>playbooks.StreakNeeded}' },
      { $Type: 'UI.DataField', Value: shadow_failures,   Label: '{i18n>playbooks.ShadowFailures}' },
      { $Type: 'UI.DataField', Value: first_failure_seq, Label: '{i18n>playbooks.FirstFailureSeq}' }
    ]
  },
  UI.FieldGroup #production: {
    Data: [
      { $Type: 'UI.DataField', Value: frozen_runs,       Label: '{i18n>playbooks.FrozenRuns}' },
      { $Type: 'UI.DataField', Value: rechecks,          Label: '{i18n>playbooks.Rechecks}' },
      { $Type: 'UI.DataField', Value: recheck_failures,  Label: '{i18n>playbooks.RecheckFailures}' },
      { $Type: 'UI.DataField', Value: max_disagreements, Label: '{i18n>playbooks.MaxDisagreements}' },
      { $Type: 'UI.DataField', Value: closed_at_seq,     Label: '{i18n>playbooks.ClosedAtSeq}' }
    ]
  },

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'Evidence',
      Label : '{i18n>playbooks.Evidence}',
      Facets: [
        { $Type: 'UI.ReferenceFacet', ID: 'EvidenceGate1',      Target: '@UI.FieldGroup#gate1',      Label: '{i18n>playbooks.Gate1}' },
        { $Type: 'UI.ReferenceFacet', ID: 'EvidenceGate2',      Target: '@UI.FieldGroup#gate2',      Label: '{i18n>playbooks.Gate2}' },
        { $Type: 'UI.ReferenceFacet', ID: 'EvidenceProduction', Target: '@UI.FieldGroup#production', Label: '{i18n>playbooks.Production}' }
      ]
    },
    // custom sections from the manifest: Backtest (after Evidence) and Code (after Backtest)
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'DecisionsFacet',
      Label  : '{i18n>playbooks.Decisions}',
      Target : 'decisions/@UI.PresentationVariant#history'
    }
  ],

  // ---- Worklist ------------------------------------------------------------
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: subject_key, Label: '{i18n>playbooks.SupplierDomain}', ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: version,     Label: '{i18n>playbooks.Version}',        ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: status,      Label: '{i18n>playbooks.Status}',         Criticality: statusCriticality, CriticalityRepresentation: #WithIcon, ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: task,        Label: '{i18n>playbooks.Task}',           ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: backtestText, Label: '{i18n>playbooks.Backtest}',      ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#streak', Label: '{i18n>playbooks.Gate2Streak}', ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: frozen_runs, Label: '{i18n>playbooks.FrozenRuns}',    ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: signed_by,   Label: '{i18n>playbooks.SignedBy}',      ![@UI.Importance]: #Medium },
    {
      $Type       : 'UI.DataFieldForAction',
      Action      : 'AgentService.signPlaybook',
      Label       : '{i18n>playbooks.Sign}',
      Criticality : #Positive
    },
    {
      $Type       : 'UI.DataFieldForAction',
      Action      : 'AgentService.declinePlaybook',
      Label       : '{i18n>playbooks.Reject}',
      Criticality : #Negative
    }
  ],

  UI.PresentationVariant #worklist: {
    SortOrder      : [{ $Type: 'Common.SortOrderType', Property: created_at, Descending: true }],
    Visualizations : ['@UI.LineItem']
  },

  UI.SelectionVariant #all: {
    Text: '{i18n>playbooks.ViewAll}'
  },
  UI.SelectionVariant #eligible: {
    Text         : '{i18n>playbooks.ViewEligible}',
    SelectOptions: [{ PropertyName: status, Ranges: [{ Sign: #I, Option: #EQ, Low: 'eligible' }] }]
  },
  UI.SelectionVariant #frozen: {
    Text         : '{i18n>playbooks.ViewFrozen}',
    SelectOptions: [{ PropertyName: status, Ranges: [{ Sign: #I, Option: #EQ, Low: 'frozen' }] }]
  },
  UI.SelectionVariant #closed: {
    Text         : '{i18n>playbooks.ViewClosed}',
    SelectOptions: [{ PropertyName: status, Ranges: [
      { Sign: #I, Option: #EQ, Low: 'rejected' },
      { Sign: #I, Option: #EQ, Low: 'demoted' }
    ] }]
  },

  UI.SelectionPresentationVariant #all: {
    Text                : '{i18n>playbooks.ViewAll}',
    SelectionVariant    : ![@UI.SelectionVariant#all],
    PresentationVariant : ![@UI.PresentationVariant#worklist]
  },
  UI.SelectionPresentationVariant #eligible: {
    Text                : '{i18n>playbooks.ViewEligible}',
    SelectionVariant    : ![@UI.SelectionVariant#eligible],
    PresentationVariant : ![@UI.PresentationVariant#worklist]
  },
  UI.SelectionPresentationVariant #frozen: {
    Text                : '{i18n>playbooks.ViewFrozen}',
    SelectionVariant    : ![@UI.SelectionVariant#frozen],
    PresentationVariant : ![@UI.PresentationVariant#worklist]
  },
  UI.SelectionPresentationVariant #closed: {
    Text                : '{i18n>playbooks.ViewClosed}',
    SelectionVariant    : ![@UI.SelectionVariant#closed],
    PresentationVariant : ![@UI.PresentationVariant#worklist]
  }
);

// Field labels for the properties that appear without an explicit Label above.
annotate srv.Playbooks with {
  status      @Common.Label: '{i18n>playbooks.Status}';
  task        @Common.Label: '{i18n>playbooks.Task}';
  subject_key @Common.Label: '{i18n>playbooks.SupplierDomain}';
  version     @Common.Label: '{i18n>playbooks.Version}';
  steps       @Common.Label: '{i18n>playbooks.Steps}';
  name        @Common.Label: '{i18n>playbooks.Name}';
  extractor_source @Common.Label: '{i18n>playbooks.Code}';
  statusCriticality @UI.Hidden;
  canSign           @UI.Hidden;
  canReject         @UI.Hidden;
  isSigned          @UI.Hidden;
  backtest_json     @UI.Hidden;
};

// ---------------------------------------------------------------------------
// Decisions: the append-only history, shown as a table on the object page.
// ---------------------------------------------------------------------------
annotate srv.Decisions with @(
  UI.HeaderInfo: {
    TypeName       : '{i18n>playbooks.Decision}',
    TypeNamePlural : '{i18n>playbooks.Decisions}',
    Title          : { $Type: 'UI.DataField', Value: action }
  },
  UI.PresentationVariant #history: {
    SortOrder      : [{ $Type: 'Common.SortOrderType', Property: at, Descending: false }],
    Visualizations : ['@UI.LineItem']
  },
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: at,          Label: '{i18n>playbooks.At}',        ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: action,      Label: '{i18n>playbooks.Action}',    ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: from_status, Label: '{i18n>playbooks.FromStatus}', ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: to_status,   Label: '{i18n>playbooks.ToStatus}',   ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: actor,       Label: '{i18n>playbooks.Actor}',     ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: rationale,   Label: '{i18n>playbooks.Rationale}', ![@UI.Importance]: #High }
  ]
);
