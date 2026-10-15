sap.ui.define([], function () {
	"use strict";

	// backtest_json is stored as text: {"verdict":"pass","compared":3,"matched":3,"mismatches":[],"reasons":[]}
	function parse(json) {
		try {
			return json ? JSON.parse(json) : null;
		} catch (e) {
			return null;
		}
	}

	return {
		/** "pass" or "fail"; empty when the backtest has not run. */
		verdict: function (json) {
			var bt = parse(json);
			return bt && bt.verdict ? bt.verdict : "";
		},

		verdictState: function (json) {
			var bt = parse(json);
			if (!bt || !bt.verdict) {
				return "None";
			}
			return bt.verdict === "pass" ? "Success" : "Error";
		},

		/** The reasons the backtest gives, one per line; a dash when it gives none. */
		reasons: function (json) {
			var bt = parse(json);
			return bt && Array.isArray(bt.reasons) && bt.reasons.length ? bt.reasons.join("\n") : "-";
		},

		/** Past runs where the code and the model disagreed, as pretty JSON; a dash when there are none. */
		mismatches: function (json) {
			var bt = parse(json);
			return bt && Array.isArray(bt.mismatches) && bt.mismatches.length ? JSON.stringify(bt.mismatches, null, 2) : "-";
		}
	};
});
