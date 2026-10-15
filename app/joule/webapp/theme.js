/* Quartz theme: dark variant when the system prefers dark. Runs before the UI5 bootstrap. */
window["sap-ui-config"] = {
  theme: window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "sap_fiori_3_dark" : "sap_fiori_3",
};
