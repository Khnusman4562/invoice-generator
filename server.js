const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const { toWords } = require("number-to-words");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/generate-invoice", async (req, res) => {
    try {
        const invoiceData = req.body;

        // Normalize item keys
        invoiceData.items = invoiceData.items.map((rawItem) => {
            const formattedItem = {};
            Object.keys(rawItem).forEach((key) => {
                const match = key.match(/\d+\]\[(.+)/);
                if (match) {
                    formattedItem[match[1]] = rawItem[key];
                }
            });
            return formattedItem;
        });

        // Calculate totals
        let items = [];
        let totalAmount = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;

        invoiceData.items.forEach((item) => {
            const quantity = Number(item.quantity || 0);
            const rate = Number(item.rate || 0);
            const amount = quantity * rate;
            const cgst = (amount * 9) / 100;
            const sgst = (amount * 9) / 100;
            const igst = (amount * 18) / 100; // If needed for interstate

            totalAmount += amount;
            totalCGST += cgst;
            totalSGST += sgst;
            totalIGST += igst;

            items.push({
                itemNo: item.itemNo || "",
                hsnCode: item.hsnCode || "",
                description: item.description || "",
                quantity,
                rate,
                amount: amount.toFixed(2),
                cgst: cgst.toFixed(2),
                sgst: sgst.toFixed(2),
            });
        });

        var grandTotal;
        if(invoiceData.includeIGST){
            grandTotal = totalAmount + totalCGST + totalSGST + totalIGST;


        }else{
        grandTotal = totalAmount + totalCGST + totalSGST;
        }
        const grandTotalWords = toWords(grandTotal) + " only";

        // Load docx template
        const templatePath = path.join(__dirname, "invoice1.docx");
        const content = fs.readFileSync(templatePath, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip);

        function capitalizeFirstLetter(str) {
            if (!str) return "";
            return str.charAt(0).toUpperCase() + str.slice(1);
          }
          
          
          const docData = {
            INVOICE_NO_HERE: invoiceData.invoiceNo || "",
            INVOIVE_DATA_HERE: invoiceData.invoiceDate || "",
            STATE: capitalizeFirstLetter(invoiceData.state),
            S_CODE: invoiceData.stateCode || "",
            TRANSPORT_MODE: capitalizeFirstLetter(invoiceData.transportMode),
            Vehical_NUMBER: invoiceData.vehicleNo || "",
            DOS: invoiceData.dateOfSupply || "",
            POS: capitalizeFirstLetter(invoiceData.placeOfSupply),
            BILL_TO_NAME: capitalizeFirstLetter(invoiceData.billToName),
            BILL_TO_PARTY_WITH_NAME: capitalizeFirstLetter(invoiceData.billToAddress),
            STP_NAME: capitalizeFirstLetter(invoiceData.shipToName),
            STP_ADDRESS: capitalizeFirstLetter(invoiceData.shipToAddress),
            BILL_TO_GSTIN: invoiceData.billToGSTIN || "",
            SHIP_TO_GSTIN: invoiceData.shipToGSTIN || "",
            GSTIN_STATE: capitalizeFirstLetter(invoiceData.gstinState),
            GSTIN_CODE: invoiceData.gstinStateCode || "",
          
            items: items,
            totalAmount: totalAmount.toFixed(2),
            cgst: totalCGST.toFixed(2),
            sgst: totalSGST.toFixed(2),
            igst: invoiceData.includeIGST ? totalIGST.toFixed(2) : "",
            grandTotal: grandTotal.toFixed(2),
            grandTotalWords: capitalizeFirstLetter(grandTotalWords),
          };
          
console.log("📤 Sending this data to the template:\n", JSON.stringify(docData, null, 2));
doc.setData(docData);

        doc.render();

        const buffer = doc.getZip().generate({ type: "nodebuffer" });
        const outputPath = path.join(__dirname, "invoice_filled.docx");
        fs.writeFileSync(outputPath, buffer);

        res.download(outputPath, "invoice_filled.docx", (err) => {
            if (err) {
                console.error("Download error:", err);
                res.status(500).send("Download error.");
            }
            fs.unlinkSync(outputPath); // Cleanup after sending
        });

    } catch (error) {
        console.error("Invoice generation failed:", error);
        res.status(500).send("Internal server error.");
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
