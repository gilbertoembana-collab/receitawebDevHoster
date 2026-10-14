/**
 * Reusable utility functions for exporting table data to Excel (CSV format)
 * and printing/saving as PDF.
 */

export function exportToExcel(data: any[][], headers: string[], filename: string) {
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(';'));
  
  // Add data rows
  for (const row of data) {
    const escapedRow = row.map(val => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      // Escape semicolons and double quotes to prevent breaking Excel columns
      if (stringVal.includes(';') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    });
    csvRows.push(escapedRow.join(';'));
  }
  
  // Prepend UTF-8 Byte Order Mark (BOM) so Excel opens it with correct encoding
  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

export function printToPDF(title: string, headers: string[], rows: any[][]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita pop-ups para imprimir em PDF.');
    return;
  }

  const tableHeaders = headers.map(h => `
    <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left; background-color: #f8fafc; color: #1e293b; font-weight: 600; font-size: 13px;">
      ${escapeHtml(h)}
    </th>
  `).join('');

  const tableRows = rows.map(row => {
    const cells = row.map(cell => `
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 12px; white-space: pre-wrap;">
        ${escapeHtml(cell)}
      </td>
    `).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8" />
      <style>
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          margin: 40px;
          color: #1e293b;
          background-color: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #0f172a;
          padding-bottom: 15px;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          color: #0f172a;
        }
        .meta {
          font-size: 11px;
          color: #64748b;
          text-align: right;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        @media print {
          body { margin: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Relatório de Dados do Sistema</div>
        </div>
        <div class="meta">
          <div>Gerado em: ${new Date().toLocaleString('pt-PT')}</div>
          <div>Total de registros: ${rows.length}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>${tableHeaders}</tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
