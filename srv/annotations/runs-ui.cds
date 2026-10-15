using { AgentService as srv } from '../agent-service';

// ---------------------------------------------------------------------------
// Agent app (app/agent): Worklist (List Report) over Runs + Object Page.
// Only additive: two navigation/helper elements so the UI can show colour and
// the model calls of a run. No existing field, action or behaviour changes.
// ---------------------------------------------------------------------------
extend srv.Runs with columns {
  // tokens of the run as one number (what the ratio counts)
  (tokens_input + tokens_output) as tokens_total : Integer,
  // 3 good, 2 warning, 5 neutral (Type 1 saves the model, Type 3 explores)
  (case when run_type = 1 then 3 when run_type = 2 then 2 else 5 end) as type_criticality : Integer,
  // 1 error (wrong or failed), 2 warning (fallback or code disagreed), 3 good
  (case when wrong = true or status = 'failed' then 1
        when shadow_match = false or note is not null then 2
        else 3 end) as result_criticality : Integer,
  // the model calls that belong to this run (ModelCalls.run points back at Runs)
  model_calls_list : Association to many srv.ModelCalls on model_calls_list.run.ID = $self.ID
};

annotate srv.Runs with @(
  Common.Label : '{i18n>agent.Runs}',

  UI.HeaderInfo : {
    TypeName       : '{i18n>agent.Run}',
    TypeNamePlural : '{i18n>agent.Runs}',
    Title          : { Value : ID },
    Description    : { Value : message_id }
  },

  // ---------------------------------------------------------------- Worklist
  UI.PresentationVariant : {
    SortOrder      : [{ Property : seq, Descending : true }],
    Visualizations : ['@UI.LineItem']
  },

  // Predefined views: all runs, then one per run type
  UI.SelectionPresentationVariant #all : {
    Text                : '{i18n>agent.viewAll}',
    SelectionVariant    : { SelectOptions : [] },
    PresentationVariant : {
      SortOrder      : [{ Property : seq, Descending : true }],
      Visualizations : ['@UI.LineItem']
    }
  },
  UI.SelectionPresentationVariant #type1 : {
    Text                : '{i18n>agent.viewType1}',
    SelectionVariant    : { SelectOptions : [{ PropertyName : run_type, Ranges : [{ Sign : #I, Option : #EQ, Low : 1 }] }] },
    PresentationVariant : {
      SortOrder      : [{ Property : seq, Descending : true }],
      Visualizations : ['@UI.LineItem']
    }
  },
  UI.SelectionPresentationVariant #type2 : {
    Text                : '{i18n>agent.viewType2}',
    SelectionVariant    : { SelectOptions : [{ PropertyName : run_type, Ranges : [{ Sign : #I, Option : #EQ, Low : 2 }] }] },
    PresentationVariant : {
      SortOrder      : [{ Property : seq, Descending : true }],
      Visualizations : ['@UI.LineItem']
    }
  },
  UI.SelectionPresentationVariant #type3 : {
    Text                : '{i18n>agent.viewType3}',
    SelectionVariant    : { SelectOptions : [{ PropertyName : run_type, Ranges : [{ Sign : #I, Option : #EQ, Low : 3 }] }] },
    PresentationVariant : {
      SortOrder      : [{ Property : seq, Descending : true }],
      Visualizations : ['@UI.LineItem']
    }
  },

  UI.LineItem : [
    { $Type : 'UI.DataField', Value : ID,               ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '7rem' } },
    { $Type : 'UI.DataField', Value : message_id,       ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '8rem' } },
    { $Type : 'UI.DataField', Value : run_type,         ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '5rem' }, Criticality : type_criticality, CriticalityRepresentation : #WithIcon },
    { $Type : 'UI.DataField', Value : route,            ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '8rem' } },
    { $Type : 'UI.DataField', Value : playbook_version, ![@UI.Importance] : #Medium, ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '8rem' } },
    { $Type : 'UI.DataField', Value : task,             ![@UI.Importance] : #Medium, ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '11rem' } },
    { $Type : 'UI.DataField', Value : tokens_total,     ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '6rem' } },
    { $Type : 'UI.DataField', Value : status,           ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '8rem' }, Criticality : result_criticality, CriticalityRepresentation : #WithIcon },
    { $Type : 'UI.DataField', Value : note,             ![@UI.Importance] : #Medium }
  ],


  // ------------------------------------------------------------- Object Page
  UI.HeaderFacets : [
    { $Type : 'UI.ReferenceFacet', Target : '@UI.DataPoint#runType',  ![@UI.Importance] : #High },
    { $Type : 'UI.ReferenceFacet', Target : '@UI.DataPoint#route',    ![@UI.Importance] : #High },
    { $Type : 'UI.ReferenceFacet', Target : '@UI.DataPoint#tokens',   ![@UI.Importance] : #High },
    { $Type : 'UI.ReferenceFacet', Target : '@UI.DataPoint#status',   ![@UI.Importance] : #High }
  ],

  UI.DataPoint #runType : { Value : run_type,     Title : '{i18n>agent.runType}', Criticality : type_criticality },
  UI.DataPoint #route   : { Value : route,        Title : '{i18n>agent.route}' },
  UI.DataPoint #tokens  : { Value : tokens_total, Title : '{i18n>agent.tokens}' },
  UI.DataPoint #status  : { Value : status,       Title : '{i18n>agent.result}', Criticality : result_criticality },

  UI.Facets : [
    { $Type : 'UI.ReferenceFacet', ID : 'general',    Label : '{i18n>agent.general}',    Target : '@UI.FieldGroup#general' },
    { $Type : 'UI.ReferenceFacet', ID : 'toolCalls',  Label : '{i18n>agent.toolCalls}',  Target : 'tool_calls/@UI.LineItem' },
    { $Type : 'UI.ReferenceFacet', ID : 'modelCalls', Label : '{i18n>agent.modelCalls}', Target : 'model_calls_list/@UI.LineItem' },
    { $Type : 'UI.ReferenceFacet', ID : 'output',     Label : '{i18n>agent.output}',     Target : '@UI.FieldGroup#output' }
  ],

  UI.FieldGroup #general : {
    Data : [
      { $Type : 'UI.DataField', Value : task },
      { $Type : 'UI.DataField', Value : message_id },
      { $Type : 'UI.DataField', Value : subject_key },
      { $Type : 'UI.DataField', Value : route },
      { $Type : 'UI.DataField', Value : playbook_version },
      { $Type : 'UI.DataField', Value : path },
      { $Type : 'UI.DataField', Value : model },
      { $Type : 'UI.DataField', Value : model_calls },
      { $Type : 'UI.DataField', Value : tokens_input },
      { $Type : 'UI.DataField', Value : tokens_output },
      { $Type : 'UI.DataField', Value : tokens_estimated },
      { $Type : 'UI.DataField', Value : shadow_match },
      { $Type : 'UI.DataField', Value : wrong },
      { $Type : 'UI.DataField', Value : started_at },
      { $Type : 'UI.DataField', Value : finished_at },
      { $Type : 'UI.DataField', Value : note }
    ]
  },

  UI.FieldGroup #output : {
    Data : [{ $Type : 'UI.DataField', Value : output_json }]
  }
);

annotate srv.Runs with {
  ID               @title : '{i18n>agent.run}';
  seq              @title : '{i18n>agent.seq}';
  message_id       @title : '{i18n>agent.email}';
  task             @title : '{i18n>agent.task}';
  subject_key      @title : '{i18n>agent.supplierDomain}';
  route            @title : '{i18n>agent.route}';
  run_type         @title : '{i18n>agent.runType}';
  path             @title : '{i18n>agent.path}';
  playbook_version @title : '{i18n>agent.playbookVersion}';
  tokens_input     @title : '{i18n>agent.tokensIn}';
  tokens_output    @title : '{i18n>agent.tokensOut}';
  tokens_total     @title : '{i18n>agent.tokens}';
  model_calls      @title : '{i18n>agent.modelCallCount}';
  tokens_estimated @title : '{i18n>agent.tokensEstimated}';
  model            @title : '{i18n>agent.model}';
  status           @title : '{i18n>agent.result}';
  shadow_match     @title : '{i18n>agent.shadowMatch}';
  wrong            @title : '{i18n>agent.wrong}';
  note             @title : '{i18n>agent.note}';
  output_json      @title : '{i18n>agent.output}'  @UI.MultiLineText;
  started_at       @title : '{i18n>agent.startedAt}';
  finished_at      @title : '{i18n>agent.finishedAt}';
  type_criticality   @UI.Hidden;
  result_criticality @UI.Hidden;
};

// ---------------------------------------------------------------- ToolCalls
annotate srv.ToolCalls with @(
  UI.HeaderInfo : { TypeName : '{i18n>agent.toolCall}', TypeNamePlural : '{i18n>agent.toolCalls}', Title : { Value : name } },
  UI.PresentationVariant : { SortOrder : [{ Property : seq, Descending : false }], Visualizations : ['@UI.LineItem'] },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : seq,         ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '4rem' } },
    { $Type : 'UI.DataField', Value : name,        ![@UI.Importance] : #High,   ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '10rem' } },
    { $Type : 'UI.DataField', Value : duration_ms, ![@UI.Importance] : #Medium, ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '8rem' } },
    { $Type : 'UI.DataField', Value : error,       ![@UI.Importance] : #Medium, ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '10rem' } },
    { $Type : 'UI.DataField', Value : input_json,  ![@UI.Importance] : #Medium, ![@HTML5.CssDefaults] : { $Type : 'HTML5.CssDefaultsType', width : '20rem' } },
    { $Type : 'UI.DataField', Value : output_json, ![@UI.Importance] : #Medium }
  ]
);
annotate srv.ToolCalls with {
  seq         @title : '{i18n>agent.step}';
  name        @title : '{i18n>agent.tool}';
  duration_ms @title : '{i18n>agent.durationMs}';
  error       @title : '{i18n>agent.error}';
  input_json  @title : '{i18n>agent.input}';
  output_json @title : '{i18n>agent.output}';
};

// --------------------------------------------------------------- ModelCalls
annotate srv.ModelCalls with @(
  UI.HeaderInfo : { TypeName : '{i18n>agent.modelCall}', TypeNamePlural : '{i18n>agent.modelCalls}', Title : { Value : purpose } },
  UI.PresentationVariant : { SortOrder : [{ Property : at, Descending : false }], Visualizations : ['@UI.LineItem'] },
  UI.LineItem : [
    { $Type : 'UI.DataField', Value : purpose,       ![@UI.Importance] : #High },
    { $Type : 'UI.DataField', Value : model,         ![@UI.Importance] : #High },
    { $Type : 'UI.DataField', Value : tokens_input,  ![@UI.Importance] : #High },
    { $Type : 'UI.DataField', Value : tokens_output, ![@UI.Importance] : #High },
    { $Type : 'UI.DataField', Value : estimated,     ![@UI.Importance] : #Medium },
    { $Type : 'UI.DataField', Value : at,            ![@UI.Importance] : #Medium }
  ]
);
annotate srv.ModelCalls with {
  purpose       @title : '{i18n>agent.purpose}';
  model         @title : '{i18n>agent.model}';
  tokens_input  @title : '{i18n>agent.tokensIn}';
  tokens_output @title : '{i18n>agent.tokensOut}';
  estimated     @title : '{i18n>agent.estimated}';
  at            @title : '{i18n>agent.at}';
};
