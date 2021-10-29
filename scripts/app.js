var global_inventory = [];

const sheet_key = "1P-jAXBjs5J_9Z3R_aN6KGWhB2OzlA5WJaRZbL1nHSFw";
const sheet_ids = [62212422, 363871847];

const options = {
    limit: 100, // don't return more results than you need!
    allowTypo: true, // if you don't care about allowing typos
    threshold: -10000, // don't return bad results
    keys: ['name', 'specific_name', 'category',], // keys to search
}

function get_sheet_url(key, id) {
    return `https://docs.google.com/spreadsheets/d/${key}/export?format=csv&gid=${id}`
}


async function getSheets() {
    console.log("Getting sheets...");

    const material_response = await fetch(get_sheet_url(sheet_key, sheet_ids[0]));
    const material_data = await material_response.text();

    const tool_response = await fetch(get_sheet_url(sheet_key, sheet_ids[1]));
    const tool_data = await tool_response.text();

    const materials = Papa.parse(material_data, {
        download: false,
        header: true,
    });

    const tools = Papa.parse(tool_data, {
        download: false,
        header: true,
    });

    if (materials.errors.length > 0 || tools.errors.length > 0) {
        console.log("Error getting sheets");
        console.log(materials.errors);
        console.log(tools.errors);
        return null;
    }

    console.log("Sheets retrieved:");
    console.log(`Materials: ${materials.data.length}`);
    console.log(`Tools: ${tools.data.length}`);


    return {
        materials,
        tools
    };
}

function capitalize(s) {
    return s.trim().toLowerCase().replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
}


function normalizeInventory(materials, tools) {
    /* 
    *  Normalize the inventory data to a format that can be searched
    *  as the materials and tools are in slightly different formats
    *  and the data is not consistent.
    */

    /* Inventory object
    * Name: string
    * Specific name: string
    * Category: string
    * Quantity: string
    * Last Checked: date
    * Location: string
    * Condition: Fine/Broken/NA
    */

    let inventory = [];

    for (let i = 0; i < tools.data.length; i++) {
        inventory.push({
            name: capitalize(tools.data[i]["General Name"]),
            specific_name: tools.data[i]["Specific Name "],
            category: capitalize(tools.data[i]["Category"]),
            quantity: capitalize(tools.data[i]["How many currently working?"]),
            last_checked: new Date(tools.data[i]["Last checked by steward"]) ?? "NA",
            location: capitalize(tools.data[i]["Where to find it:"]),
            condition: capitalize(tools.data[i]["Condition"]),
        });
    }

    for (let i = 0; i < materials.data.length; i++) {
        inventory.push({
            name: capitalize(materials.data[i]["General Name"]),
            specific_name: materials.data[i]["Specific Name / Brand"],
            category: capitalize(materials.data[i]["Category"]),
            quantity: capitalize(materials.data[i]["How many or high, medium, low inventory?"]),
            last_checked: new Date(materials.data[i]["Last Checked by a Steward:"]) ?? "NA",
            location: capitalize(materials.data[i]["Where to find it:"]),
            condition: "NA",
        });
    }

    return inventory;
}

function createSearcher(inventory) {
    inventory.forEach((t, index) => t.descIndex = index);
    inventory.forEach(t => t.filePrepared = fuzzysort.prepare(t.file));
    return inventory;
}

async function prepareInventory() {
    let sheets = await getSheets();
    let normalized_inventory = normalizeInventory(sheets.materials, sheets.tools);

    global_inventory = createSearcher(normalized_inventory);
}

function update_loop() {
    setTimeout(function () {
        prepareInventory();
    }, 120000)
}

function replaceHtml(el, html) {
	var oldEl = typeof el === "string" ? document.getElementById(el) : el;
	/*@cc_on // Pure innerHTML is slightly faster in IE
		oldEl.innerHTML = html;
		return oldEl;
	@*/
	var newEl = oldEl.cloneNode(false);
	newEl.innerHTML = html;
	oldEl.parentNode.replaceChild(newEl, oldEl);
	/* Since we just removed the old element from the DOM, return a reference
	to the new element, which can be used to restore variable references. */
	return newEl;
};

function asSimpleDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function updateResults() {
    let input = document.getElementById("search-input");
    let output = document.getElementById("search-results");

    let results = [];
    let query = input.value;

    if (query.length == 0) {
        results = global_inventory;
    } else {
        if (query.includes(" ")) {
			const terms = query.split(" ");
			for (let search_term of terms) {
				let temp_results = fuzzysort.go(search_term.trim(), global_inventory, options);
				
				if (results.length > 0) {
					results = results.filter(t => temp_results.map(t => t.obj.specific_name).includes(t.obj.specific_name));
				} else {
					results = temp_results;
				}
            }
            
			results = results.sort((a, b) => b.score - a.score);
			
		} else {
			results = fuzzysort.go(query, global_inventory, options);
		}
    }

    let items_html = `
    <div class="result header">
        <div class="result name">Name</div>
        <div class="result category">Category</div>
        <div class="result location">Location</div>
        <div class="result quantity">Quantity</div>
        <div class="result condition">Condition (if tool)</div>
        <div class="result last-checked">Last Checked</div>
    </div>
    `;

    for (let result of results) {
        let item_html = `
            <div class="result">
                <div class="result name">${result.name ?? result.obj.name}</div>
                <div class="result category">${result.category ?? result.obj.category}</div>
                <div class="result location">${result.location ?? result.obj.location}</div>
                <div class="result quantity">${result.quantity ?? result.obj.quantity}</div>
                <div class="result condition">${result.condition ?? result.obj.condition}</div>
                <div class="result last-checked">${asSimpleDate(result.last_checked ?? result.obj.last_checked)}</div>
            </div>
        `;

        items_html += item_html;
    }

    replaceHtml(output, items_html);
}

function requestItem() {
    window.open("https://docs.google.com/forms/d/e/1FAIpQLSdTW_DD2_LnClS0X5jmzhL5NPRNpkJImFQtGaXf0l30mCqRsQ/viewform");
}

async function startup() {
    console.log("Starting up...");
    document.getElementById("search-input").focus();

    await prepareInventory();
    console.log("Inventory prepared");

    updateResults();

    update_loop();
}

startup();