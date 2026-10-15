sap.ui.define(["sap/ui/core/format/NumberFormat", "sap/ui/core/format/DateFormat"], function (NumberFormat, DateFormat) {
	"use strict";

	var VERDICT_TEXT = { freeze: "verdictFreeze", candidate: "verdictCandidate", "keep-with-model": "verdictKeep" };
	var FORMAT_TEXT = { runlog: "formatNameRunlog", otel: "formatNameOtel" };

	/**
	 * Adds the display texts to the answer of the analyze action. The numbers stay numbers, so the view can
	 * format them with data types. Only values that need a sentence, a currency or a dash are made here.
	 * @param {object} result the parsed answer of the analyze action
	 * @param {sap.base.i18n.ResourceBundle} bundle the texts of the app
	 * @returns {object} the same object, extended
	 */
	function decorate(result, bundle) {
		var integer = NumberFormat.getIntegerInstance({ groupingEnabled: true });
		var currency = NumberFormat.getCurrencyInstance({ currencyCode: false });
		var dateTime = DateFormat.getDateTimeInstance({ style: "medium" });
		var text = function (key, args) {
			return bundle.getText(key, args);
		};

		result.hasProblems = result.problemCount > 0;
		if (result.hasProblems) {
			var first = result.problems[0];
			result.problemsText =
				result.problemCount === 1
					? text("problemText", [first.line, first.path, first.message])
					: text("problemsText", [integer.format(result.problemCount), first.line, first.path, first.message]);
		}
		result.formatText = text(FORMAT_TEXT[result.format] || "formatNameRunlog");
		result.validText = text("runsValid", [integer.format(result.valid), integer.format(result.records)]);
		result.windowDaysText = result.window ? text("windowDays", [result.window.days]) : text("noWindow");
		result.windowRangeText = result.window
			? text("windowRange", [dateTime.format(new Date(result.window.from)), dateTime.format(new Date(result.window.to))])
			: text("noWindow");
		result.thresholds.minPathShareText = NumberFormat.getPercentInstance({ maxFractionDigits: 0 }).format(result.thresholds.minPathShare);

		result.rows.forEach(function (row) {
			row.typeText = text("type" + row.type);
		});
		result.candidates.forEach(function (candidate) {
			candidate.verdictText = text(VERDICT_TEXT[candidate.verdict]);
			candidate.reasonsText = candidate.reasons.join("\n");
			candidate.monthlyTokensText = candidate.monthlyTokens == null ? text("none") : integer.format(candidate.monthlyTokens);
			candidate.monthlyCostText = candidate.monthlyCost == null ? text("none") : currency.format(candidate.monthlyCost, "USD");
		});
		return result;
	}

	return { decorate: decorate };
});
