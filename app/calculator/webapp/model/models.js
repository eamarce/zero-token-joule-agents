sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
	"use strict";

	return {
		/**
		 * The state of the page: what is in the text area, the options and the last result.
		 * @returns {sap.ui.model.json.JSONModel} the model named "ui"
		 */
		createUiModel: function () {
			return new JSONModel({
				busy: false,
				content: "",
				format: "auto",
				price: "",
				minRepeats: "",
				minPathShare: "",
				minTokens: "",
				hasResult: false,
				result: {}
			});
		},

		/**
		 * The options object the analyze action expects, as a JSON string. Empty fields are left out so the
		 * service keeps its own defaults.
		 * @param {object} ui the data of the "ui" model
		 * @returns {string} JSON text
		 */
		toOptions: function (ui) {
			var options = {};
			[
				["pricePerMTok", ui.price],
				["minRepeats", ui.minRepeats],
				["minPathShare", ui.minPathShare],
				["minTokens", ui.minTokens]
			].forEach(function (pair) {
				var value = pair[1] === "" || pair[1] == null ? NaN : Number(pair[1]);
				if (Number.isFinite(value) && value > 0) {
					options[pair[0]] = value;
				}
			});
			return JSON.stringify(options);
		}
	};
});
