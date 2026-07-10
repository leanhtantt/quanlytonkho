const http = require('http');
http.get('http://localhost:3000/api/purchases', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const p = json.find(x => x.id === 'ĐƠN 16');
    if (p) {
      const sumOfRoundedFinalCosts = p.items.reduce((s, i) => s + (i.qty * i.finalCostVnd), 0);
      console.log('sum of (qty * finalCostVnd): ', sumOfRoundedFinalCosts);
    }
  });
});
