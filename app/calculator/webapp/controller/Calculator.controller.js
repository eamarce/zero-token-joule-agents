sap.ui.define(
	[
		"sap/ui/core/mvc/Controller",
		"sap/m/MessageBox",
		"sap/m/MessageToast",
		"../model/models",
		"../model/analysis"
	],
	function (Controller, MessageBox, MessageToast, models, analysis) {
		"use strict";

		return Controller.extend("zt.calculator.controller.Calculator", {
			onInit: function () {
				var component = this.getOwnerComponent();
				this._ui = component.getModel("ui");
				// The bundle may arrive as a promise, depending on how the model was created.
				this._bundle = null;
				Promise.resolve(component.getModel("i18n").getResourceBundle()).then(
					function (bundle) {
						this._bundle = bundle;
					}.bind(this)
				);
			},

			// ------------------------------------------------------------ loading a log

			onFileChange: function (event) {
				var files = event.getParameter("files");
				var file = files && files[0];
				if (!file) {
					return;
				}
				file.text().then(
					function (text) {
						this._ui.setProperty("/content", text);
						MessageToast.show(this._text("fileLoaded", [file.name, text.length]));
					}.bind(this),
					function () {
						MessageBox.error(this._text("errorReadFile"), { title: this._text("errorTitle") });
					}.bind(this)
				);
			},

			onLoadSample: function (event) {
				var format = event.getSource().data("format");
				this._run(function () {
					return this._call("calculator", "/sample(...)", { format: format }).then(
						function (text) {
							this._setLog(text, format);
						}.bind(this)
					);
				});
			},

			onLoadAgentRuns: function () {
				this._run(function () {
					return this._call("agent", "/exportRunLog(...)", {}).then(
						function (text) {
							this._setLog(text, "runlog");
						}.bind(this)
					);
				});
			},

			// ------------------------------------------------------------ analyzing

			onAnalyze: function () {
				var data = this._ui.getData();
				if (!data.content) {
					return;
				}
				this._run(function () {
					return this._call("calculator", "/analyze(...)", {
						content: data.content,
						format: data.format,
						options: models.toOptions(data)
					}).then(
						function (json) {
							var result;
							try {
								result = JSON.parse(json);
							} catch (error) {
								throw new Error(this._text("errorBadResponse"));
							}
							this._ui.setProperty("/result", analysis.decorate(result, this._bundle));
							this._ui.setProperty("/hasResult", true);
							this._showResult();
						}.bind(this)
					);
				});
			},

			onClear: function () {
				this._ui.setProperty("/content", "");
				this._ui.setProperty("/hasResult", false);
				this._ui.setProperty("/result", {});
				this.byId("fileUploader").clear();
				MessageToast.show(this._text("cleared"));
			},

			// ------------------------------------------------------------ helpers

			/** The result sits below the options; bring it into view once it has rendered. */
			_showResult: function () {
				setTimeout(
					function () {
						var dom = this.byId("result").getDomRef();
						if (dom) {
							dom.scrollIntoView({ behavior: "smooth", block: "start" });
						}
					}.bind(this),
					150
				);
			},

			_setLog: function (text, format) {
				this._ui.setProperty("/content", text);
				this._ui.setProperty("/format", format);
				MessageToast.show(this._text("logLoaded", [text.length]));
			},

			/**
			 * Calls an unbound OData V4 action or function and resolves with its string result.
			 * @param {string} modelName model from the manifest: "calculator" or "agent"
			 * @param {string} path operation path with the deferred "(...)" suffix
			 * @param {object} parameters the operation parameters
			 * @returns {Promise<string>} the value the operation returned
			 */
			_call: function (modelName, path, parameters) {
				var binding = this.getView().getModel(modelName).bindContext(path);
				Object.keys(parameters).forEach(function (name) {
					binding.setParameter(name, parameters[name]);
				});
				return binding.invoke().then(function () {
					return binding.getBoundContext().getObject().value;
				});
			},

			/** Shows the page as busy while the work runs and reports a failure in a message box. */
			_run: function (work) {
				this._ui.setProperty("/busy", true);
				return Promise.resolve()
					.then(work.bind(this))
					.catch(
						function (error) {
							MessageBox.error(error.message || String(error), { title: this._text("errorTitle") });
						}.bind(this)
					)
					.then(
						function () {
							this._ui.setProperty("/busy", false);
						}.bind(this)
					);
			},

			_text: function (key, args) {
				return this._bundle ? this._bundle.getText(key, args) : key;
			}
		});
	}
);
