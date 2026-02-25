const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/gerar-tag', async (req, res) => {
    const { forma, tamanho, temNFC, nome, telefone } = req.body;

    // 1. Definição do template correto com base nos teus ficheiros
    const nomeTemplate = `${forma}_${tamanho}${temNFC ? '_NFC' : ''}`;
    
    const id = `tag_${Date.now()}`;
    const scadPath = path.join(__dirname, 'temp', `${id}.scad`);
    const stlPath = path.join(__dirname, 'temp', `${id}.stl`);

    // Lógica de posicionamento
    const yNome = (forma === 'coracao') ? 8 : 0;
    const yVerso = (forma === 'coracao') ? 6 : 0;
    
    // Pequeno ajuste: garantir que 'S' ou 's' funciona na lógica
    const tamFonte = (tamanho.toLowerCase() === 's') ? 4 : 8;
    const tamFonteVerso = (tamanho.toLowerCase() === 's') ? 3 : 3;

    const logoNFC = `
        translate([0, 2, 0]) linear_extrude(1.2) {
            for (i = [1 : 3]) {
                difference() {
                    circle(d = i * 6);
                    circle(d = (i * 6) - 1.8);
                    translate([-15, -15, 0]) square([30, 15]);
                }
            }
            circle(d = 2);
        }
        translate([0, -6, 0]) linear_extrude(1.2)
            text("NFC", size = 4, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
    `;

    // 2. O SCAD agora importa o 'nomeTemplate' (ex: osso_M_NFC.stl)
    const scadCode = `
$fn=60;
difference() {
    union() {
        // Usando path.join para garantir o caminho correto no Linux
        import("${path.join(__dirname, 'templates', nomeTemplate + '.stl').replace(/\\/g, '/')}");
        
        translate([0, ${yNome}, 2]) linear_extrude(0.8)
            text("${nome}", size=${tamFonte}, halign="center", valign="center", font="Liberation Sans:style=Bold");
    }
    
    translate([0, ${yVerso}, -2.1]) mirror([1,0,0]) {
        ${temNFC ? logoNFC : `linear_extrude(1.2) text("${telefone}", size=${tamFonteVerso}, halign="center", valign="center", font="Liberation Sans:style=Bold");`}
    }
}`;

    try {
        fs.writeFileSync(scadPath, scadCode);

        exec(`openscad -o ${stlPath} ${scadPath}`, async (error) => {
            if (error) {
                console.error("Erro OpenSCAD:", error);
                return res.status(500).json({ error: "Erro na renderização 3D" });
            }

            const fileBuffer = fs.readFileSync(stlPath);
            const fileName = `${id}.stl`;

            const { data, error: uploadErr } = await supabase.storage
                .from('medalhas_personalizadas')
                .upload(`final/${fileName}`, fileBuffer, {
                    contentType: 'model/stl',
                    upsert: true
                });

            if (fs.existsSync(scadPath)) fs.unlinkSync(scadPath);
            if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);

            if (uploadErr) throw uploadErr;

            const { data: { publicUrl } } = supabase.storage
                .from('medalhas_personalizadas')
                .getPublicUrl(`final/${fileName}`);

            res.json({ success: true, url: publicUrl });
        });
    } catch (err) {
        console.error("Erro Geral:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor a correr na porta ${PORT}`));
