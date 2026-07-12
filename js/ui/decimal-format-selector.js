import { t, subscribeLanguage } from "./i18n.js";

const OPTIONS = [
  { value: ".", label: "1.20" },
  { value: ",", label: "1,20" },
];

export function mountDecimalFormatSelector(container, { initialValue = ".", onChange } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "decimal-format-selector";

  const label = document.createElement("label");
  label.setAttribute("for", "decimal-format-select");
  label.textContent = `${t("header.decimalFormat")}:`;

  subscribeLanguage(() => {
    label.textContent = `${t("header.decimalFormat")}:`;
  });

  const select = document.createElement("select");
  select.id = "decimal-format-select";

  OPTIONS.forEach(({ value, label: optionLabel }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = optionLabel;
    select.appendChild(option);
  });

  select.value = initialValue === "," ? "," : ".";

  select.addEventListener("change", () => {
    if (onChange) onChange(select.value);
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  container.appendChild(wrap);

  return {
    setValue: (value) => {
      select.value = value === "," ? "," : ".";
    },
  };
}
