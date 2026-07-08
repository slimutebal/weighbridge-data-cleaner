export async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    return { name, rows };
  });

  return { fileName: file.name, sheets };
}
