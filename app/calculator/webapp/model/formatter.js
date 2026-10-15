sap.ui.define([], function () {
	"use strict";

	return {
		/**
		 * Value state of a verdict.
		 * @param {string} verdict freeze, candidate or keep-with-model
		 * @returns {sap.ui.core.ValueState} the state
		 */
		verdictState: function (verdict) {
			if (verdict === "freeze") {
				return "Success";
			}
			return verdict === "candidate" ? "Warning" : "None";
		},

		/**
		 * Value state of a run type: 1 spends nothing, 2 runs a playbook, 3 explores.
		 * @param {number} type the run type
		 * @returns {sap.ui.core.ValueState} the state
		 */
		typeState: function (type) {
			return { 1: "Success", 2: "Warning", 3: "Information" }[type] || "None";
		},

		/**
		 * A share between 0 and 1 as a percentage the progress indicator can draw.
		 * @param {number} share the share
		 * @returns {number} 0 to 100
		 */
		percent: function (share) {
			return Math.round((Number(share) || 0) * 100);
		}
	};
});
