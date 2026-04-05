const fs = require('fs');
const readline = require('readline');
const path = require('path');

const GO_JSON_PATH = path.join(__dirname, '..', 'my_asset', 'go.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'go_hierarchy.json');

const hierarchy = {}; // parent -> [children]

console.log('Extracting hierarchy (reliable triplet check)...');

const rl = readline.createInterface({
    input: fs.createReadStream(GO_JSON_PATH),
    terminal: false
});

let curr = {};
let edgeCount = 0;

rl.on('line', (line) => {
    const sm = line.match(/"sub"\s*:\s*"([^"]+)"/);
    const pm = line.match(/"pred"\s*:\s*"([^"]+)"/);
    const om = line.match(/"obj"\s*:\s*"([^"]+)"/);

    if (sm) curr.s = sm[1];
    if (pm) curr.p = pm[1];
    if (om) curr.o = om[1];

    // As soon as we have a triplet, process and clear
    if (curr.s && curr.p && curr.o) {
        if (curr.p === 'is_a' || curr.p.includes('BFO_0000050') || curr.p.includes('RO_0002211') || curr.p.includes('RO_0002212') || curr.p.includes('RO_0002213')) {
            const childId = curr.s.split('/').pop().replace('GO_', '').replace('GO', '');
            const parentId = curr.o.split('/').pop().replace('GO_', '').replace('GO', '');
            
            if (/^\d+$/.test(childId) && /^\d+$/.test(parentId)) {
                if (!hierarchy[parentId]) hierarchy[parentId] = [];
                if (!hierarchy[parentId].includes(childId)) {
                    hierarchy[parentId].push(childId);
                    edgeCount++;
                }
            }
        }
        curr = {}; // Trip finished, reset
    }
});

rl.on('close', () => {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(hierarchy));
    console.log(`Saved hierarchy to ${OUTPUT_PATH}`);
    console.log(`Total relationships: ${edgeCount}`);
    console.log(`Total parents: ${Object.keys(hierarchy).length}`);
});
