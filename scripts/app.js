var global_inventory = [];

const materials_url = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlpOHqojslmCaRAX-eeLSsteaBUiAwQN-5koJdnJBF6CzSzYPd9gp_wdEJHYwhcRlIZLMQtuT4WurI/pub?gid=62212422&single=true&output=csv`;
const tools_url = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlpOHqojslmCaRAX-eeLSsteaBUiAwQN-5koJdnJBF6CzSzYPd9gp_wdEJHYwhcRlIZLMQtuT4WurI/pub?gid=363871847&single=true&output=csv`;

const options = {
    limit: 100, // don't return more results than you need!
    allowTypo: true, // if you don't care about allowing typos
    threshold: -10000, // don't return bad results
    keys: ['name', 'specific_name', 'category',], // keys to search
};

async function getSheets() {
    console.log("Getting sheets...");

    const material_response = await fetch(materials_url);
    const material_data = await material_response.text();

    const tool_response = await fetch(tools_url);
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
    
    if (sheets != null) {
        console.log("Data found! Updating localstorage...");
        let normalized_inventory = normalizeInventory(sheets.materials, sheets.tools);

        global_inventory = createSearcher(normalized_inventory);

        localStorage.setItem("inventory", JSON.stringify(global_inventory));
    }   

}

function update_loop() {
    setTimeout(function () {
        console.log("Updating...");
        prepareInventory();
        updateResults();
        update_loop();
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
    if (date === "NA") {
        return "NA";
    }

    let actual_date;
    if (typeof(date) == "string") {
        actual_date = new Date(date);
    } else {
        actual_date = date;
    }
    return `${actual_date.getMonth() + 1}/${actual_date.getDate()}/${actual_date.getFullYear()}`;
}

function updateResults() {
    let input = document.getElementById("search-input");
    let output = document.getElementById("search-results");

    let results = [];
    let query = input.value.trim();

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
    <div class="result row header">
        <div class="result name">Name</div>
        <div class="result category">Category</div>
        <div class="result location">Location</div>
        <div class="result quantity">Quantity</div>
        <div class="result condition">Condition (if tool)</div>
        <div class="result last-checked">Last Checked</div>
    </div>
    `;

    for (let result of results) {
        let last_checked;
        if (result.obj == undefined) {
            last_checked = result.last_checked ?? "NA";
        } else {
            last_checked = result.obj.last_checked ?? "NA";
        }

        let item_html = `
            <div class="result row">
                <div class="result name">${result.name ?? result.obj.name}</div>
                <div class="result category">${result.category ?? result.obj.category}</div>
                <div class="result location">${result.location ?? result.obj.location}</div>
                <div class="result quantity">${result.quantity ?? result.obj.quantity}</div>
                <div class="result condition">${result.condition ?? result.obj.condition}</div>
                <div class="result last-checked">${asSimpleDate(last_checked) ?? "NA"}</div>
            </div>
        `;

        items_html += item_html;
    }

    replaceHtml(output, items_html);
    document.getElementById("results-box").scroll({ top: 0, behavior: 'smooth' });
}

function requestItem() {
    window.open("https://docs.google.com/forms/d/e/1FAIpQLSdTW_DD2_LnClS0X5jmzhL5NPRNpkJImFQtGaXf0l30mCqRsQ/viewform");
}

async function startup() {
    console.log("Starting up...");
    document.getElementById("search-input").focus();

    let inventory_promise = prepareInventory();

    let inventory = JSON.parse(localStorage.getItem("inventory"));

    if (inventory != null) {
        global_inventory = inventory;
    } else {
        await inventory_promise;
    }
    
    console.log("Inventory prepared");

    update_loop();

    updateResults();
}

startup();