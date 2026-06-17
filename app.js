let vehicleData = {};
let activeVehicle = 'bike';
let charts = {};

document.getElementById('csv-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  setStatus('reading', 'Reading file...');

  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    setStatus('error', 'Not a CSV file. Please upload the Notion CSV export.');
    return;
  }

  document.getElementById('upload-label').textContent = file.name;

  const reader = new FileReader();

  reader.onerror = function() {
    setStatus('error', 'Could not read the file. Try again.');
  };

  reader.onload = function(ev) {
    try {
      setStatus('parsing', 'Parsing fuel logs...');
      vehicleData = parseCSV(ev.target.result);

      const found = Object.keys(vehicleData);
      if (!found.length) {
        setStatus('error', 'No valid rows found. Check that your CSV headers match the expected format.');
        return;
      }

      document.getElementById('dashboard').classList.remove('hidden');
      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.style.display = vehicleData[btn.dataset.vehicle] ? '' : 'none';
      });
      activeVehicle = vehicleData['bike'] ? 'bike' : 'car';
      setActiveTab(activeVehicle);

      const summary = found.map(function(v) {
        return v + ' (' + vehicleData[v].length + ' entries)';
      }).join(', ');
      setStatus('done', 'Parsed: ' + summary);
    } catch (err) {
      setStatus('error', 'Parse error: ' + err.message);
    }
  };

  reader.readAsText(file, 'UTF-8');
});

function setStatus(state, message) {
  const bar = document.getElementById('status-bar');
  bar.textContent = message;
  bar.className = 'status-bar status-' + state;
  bar.classList.remove('hidden');
}

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    setActiveTab(btn.dataset.vehicle);
  });
});

function setActiveTab(vehicle) {
  activeVehicle = vehicle;
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.vehicle === vehicle);
  });
  renderDashboard(vehicleData[vehicle] || []);
}

function renderReportHeader(vehicle, entries) {
  const header = document.getElementById('report-header');
  if (!entries.length) return;
  
  const firstDate = fmtDate(entries[0].date);
  const lastDate = fmtDate(entries[entries.length - 1].date);
  const totalEntries = entries.length;
  
  header.innerHTML = '<div class="report-title">' + vehicle.toUpperCase() + ' Analytics Report</div>' +
    '<div class="report-meta">' +
    '<div class="report-meta-item"><span class="report-meta-label">Period:</span> <span class="report-meta-value">' + firstDate + ' - ' + lastDate + '</span></div>' +
    '<div class="report-meta-item"><span class="report-meta-label">Total Fills:</span> <span class="report-meta-value">' + totalEntries + '</span></div>' +
    '</div>';
}

function computeInsights(entries) {
  const valid = entries.filter(function(e) { return e.kmpl !== null; });
  const kmplValues = valid.map(function(e) { return e.kmpl; });
  const avgKmpl = avg(kmplValues);
  const totalCost = entries.reduce(function(s, e) { return s + e.amount; }, 0);
  const totalKm = entries[entries.length - 1].odo - entries[0].odo;
  const totalLitre = entries.reduce(function(s, e) { return s + e.litre; }, 0);
  const overallKmpl = totalLitre > 0 ? +(totalKm / totalLitre).toFixed(2) : 0;

  const intervals = entries.slice(1).map(function(e, i) {
    return (e.date - entries[i].date) / 86400000;
  });
  const avgInterval = intervals.length ? +(avg(intervals)).toFixed(1) : 0;

  const anomalies = detectAnomalies(valid);
  const trend = linearTrend(valid.map(function(e, i) { return [i, e.kmpl]; }));
  const predicted = +(trend.slope * valid.length + trend.intercept).toFixed(2);

  return {
    avgKmpl: +avgKmpl.toFixed(2),
    overallKmpl: overallKmpl,
    totalCost: totalCost,
    totalKm: totalKm,
    totalLitre: totalLitre,
    avgInterval: avgInterval,
    anomalies: anomalies,
    trend: trend,
    predicted: predicted
  };
}

function detectAnomalies(valid, threshold) {
  if (!threshold) threshold = 0.2;
  return valid.filter(function(e, i) {
    if (i < 2) return false;
    const window = valid.slice(Math.max(0, i - 3), i).map(function(x) { return x.kmpl; });
    const rollingAvg = avg(window);
    return e.kmpl < rollingAvg * (1 - threshold);
  });
}

function linearTrend(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ? points[0][1] : 0 };
  const sumX = points.reduce(function(s, p) { return s + p[0]; }, 0);
  const sumY = points.reduce(function(s, p) { return s + p[1]; }, 0);
  const sumXY = points.reduce(function(s, p) { return s + p[0] * p[1]; }, 0);
  const sumX2 = points.reduce(function(s, p) { return s + p[0] * p[0]; }, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope: +slope.toFixed(4), intercept: +intercept.toFixed(4) };
}

function avg(arr) {
  return arr.length ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : 0;
}

function buildSuggestions(insights, entries) {
  const tips = [];
  const avgKmpl = insights.avgKmpl;
  const trend = insights.trend;
  const avgInterval = insights.avgInterval;
  const anomalies = insights.anomalies;

  if (trend.slope < -0.05)
    tips.push('Your efficiency is declining over time. Consider a full service or air filter check.');
  if (avgInterval < 7)
    tips.push('You are refuelling very frequently. Short trips hurt mileage - combine errands where possible.');
  if (anomalies.length > 0)
    tips.push(anomalies.length + ' fill(s) showed sudden efficiency drops. Check tyre pressure and engine health.');
  if (avgKmpl > 0) {
    const latest3 = entries.filter(function(e) { return e.kmpl; }).slice(-3).map(function(e) { return e.kmpl; });
    if (avg(latest3) < avgKmpl * 0.9)
      tips.push('Recent mileage is below your average. Traffic patterns or driving style may have changed.');
  }

  const costPerKms = entries.filter(function(e) { return e.costPerKm; }).map(function(e) { return e.costPerKm; });
  if (costPerKms.length) {
    const latestCostPerKm = costPerKms[costPerKms.length - 1];
    const avgCostPerKm = avg(costPerKms);
    if (latestCostPerKm > avgCostPerKm * 1.15)
      tips.push('Your Rs/km cost has gone up recently. Check if fuel prices spiked or mileage dropped.');
  }

  if (!tips.length) tips.push('Great job! Your fuel efficiency looks consistent. Keep it up.');
  return tips;
}

function renderDashboard(entries) {
  if (!entries.length) return;

  renderReportHeader(activeVehicle, entries);
  const insights = computeInsights(entries);
  renderStats(insights, entries);
  renderSuggestions(buildSuggestions(insights, entries));
  renderCharts(entries, insights);
}

function renderStats(ins, entries) {
  const grid = document.getElementById('stats-grid');
  const trendDir = ins.trend.slope > 0.02 ? 'Improving' : ins.trend.slope < -0.02 ? 'Declining' : 'Stable';

  const stats = [
    { label: 'Avg km/L', value: ins.avgKmpl },
    { label: 'Overall km/L', value: ins.overallKmpl },
    { label: 'Total Fuel Cost', value: 'Rs ' + ins.totalCost.toLocaleString() },
    { label: 'Total Distance', value: ins.totalKm + ' km' },
    { label: 'Total Fuel Used', value: ins.totalLitre.toFixed(1) + ' L' },
    { label: 'Avg Refill Gap', value: ins.avgInterval + ' days' },
    { label: 'Efficiency Trend', value: trendDir },
    { label: 'Next Fill Prediction', value: '~' + ins.predicted + ' km/L' },
    { label: 'Anomalies', value: ins.anomalies.length, cls: ins.anomalies.length ? 'anomaly' : '' }
  ];

  grid.innerHTML = stats.map(function(s) {
    return '<div class="stat-card ' + (s.cls || '') + '">' +
      '<div class="label">' + s.label + '</div>' +
      '<div class="value">' + s.value + '</div>' +
      '</div>';
  }).join('');
}

function renderSuggestions(tips) {
  const box = document.getElementById('suggestions-box');
  const list = document.getElementById('suggestions-list');
  list.innerHTML = tips.map(function(t) {
    return '<li>' + t + '</li>';
  }).join('');
  box.classList.remove('hidden');
}

function renderCharts(entries, insights) {
  const valid = entries.filter(function(e) { return e.kmpl !== null; });
  const labels = valid.map(function(e) { return fmtDate(e.date); });
  const anomalySet = new Set(insights.anomalies.map(function(e) { return fmtDate(e.date); }));

  destroyCharts();

  const trendData = valid.map(function(_, i) {
    return +(insights.trend.slope * i + insights.trend.intercept).toFixed(2);
  });

  charts.efficiency = new Chart('chart-efficiency', {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'km/L',
          data: valid.map(function(e) { return e.kmpl; }),
          borderColor: '#f0c040',
          backgroundColor: 'rgba(240,192,64,0.1)',
          pointBackgroundColor: valid.map(function(e) {
            return anomalySet.has(fmtDate(e.date)) ? '#e05555' : '#f0c040';
          }),
          pointRadius: valid.map(function(e) {
            return anomalySet.has(fmtDate(e.date)) ? 7 : 4;
          }),
          tension: 0.3,
          fill: true
        },
        {
          label: 'Trend',
          data: trendData,
          borderColor: '#4caf7d',
          borderDash: [6, 3],
          pointRadius: 0,
          tension: 0
        }
      ]
    },
    options: chartOptions('km/L')
  });

  charts.cost = new Chart('chart-cost', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Rs Spent',
        data: valid.map(function(e) { return e.amount; }),
        backgroundColor: '#7c6af7'
      }]
    },
    options: chartOptions('Rs')
  });

  charts.rupeeKm = new Chart('chart-rupee-km', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Rs vs km',
        data: valid.map(function(e) { return { x: e.distance, y: e.amount }; }),
        backgroundColor: '#4caf7d',
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#aaa' } } },
      scales: {
        x: {
          grid: { color: '#1e2130' },
          ticks: { color: '#888' },
          title: { display: true, text: 'km driven', color: '#888' }
        },
        y: {
          grid: { color: '#1e2130' },
          ticks: { color: '#888' },
          title: { display: true, text: 'Rs spent', color: '#888' }
        }
      }
    }
  });

  const refillLabels = valid.slice(1).map(function(e) { return fmtDate(e.date); });
  const intervals = valid.slice(1).map(function(e, i) {
    return +((e.date - valid[i].date) / 86400000).toFixed(0);
  });

  charts.refill = new Chart('chart-refill', {
    type: 'bar',
    data: {
      labels: refillLabels,
      datasets: [{
        label: 'Days since last fill',
        data: intervals,
        backgroundColor: '#38bdf8'
      }]
    },
    options: chartOptions('days')
  });
}

function destroyCharts() {
  Object.values(charts).forEach(function(c) { c.destroy(); });
  charts = {};
}

function chartOptions(yLabel) {
  if (!yLabel) yLabel = '';
  return {
    responsive: true,
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: {
      x: { grid: { color: '#1e2130' }, ticks: { color: '#888' } },
      y: {
        grid: { color: '#1e2130' },
        ticks: { color: '#888' },
        title: { display: yLabel !== '', text: yLabel, color: '#888' }
      }
    }
  };
}

function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
