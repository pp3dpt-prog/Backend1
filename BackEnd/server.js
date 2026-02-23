const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors()); // Permite que o teu Front-end comunique com o API
app.use(express.json());

// Configuração Supabase (Vem das variáveis de ambiente do Render)
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/gerar-tag', async (req, res) => {
    const { nome, telefone, forma, tamanho, temNFC } = req.body;
    
    // Nome do ficheiro único para evitar conflitos
    const id = `tag_${Date.now()}`;
    const scadPath = path.join(__dirname, 'temp', `${id}.scad`);
    const stlPath = path.join(__dirname, 'temp', `${id}.stl`);

    // Lógica de posicionamento que definimos
    const yNome = (forma === 'coracao') ? 8 : 0;
    const yVerso = (forma === 'coracao') ? 6 : 0;
    const tamFonte = (tamanho === 's') ? 6 : 8;

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

    const scadCode = `
$fn=60;
difference() {
    union() {
        import("templates/${forma}_${tamanho}.stl");
        // NOME NA FRENTE
        translate([0, ${yNome}, 2]) linear_extrude(0.8)
            text("${nome}", size=${tamFonte}, halign="center", valign="center", font="Liberation Sans:style=Bold");
    }
    // CONTEÚDO NO VERSO (Escavado)
    translate([0, ${yVerso}, -2.1]) mirror([1,0,0]) {
        ${temNFC ? logoNFC : `linear_extrude(1.2) text("${telefone}", size=4.5, halign="center", valign="center", font="Liberation Sans:style=Bold");`}
    }
}`;

    try {
        // 1. Escrever o ficheiro .scad temporário
        fs.writeFileSync(scadPath, scadCode);

        // 2. Executar OpenSCAD para gerar o STL
        exec(`openscad -o ${stlPath} ${scadPath}`, async (error) => {
            if (error) {
                console.error("Erro OpenSCAD:", error);
                return res.status(500).json({ error: "Erro na renderização 3D" });
            }

            // 3. Ler o ficheiro gerado e fazer upload para o Supabase
            const fileBuffer = fs.readFileSync(stlPath);
            const fileName = `${id}.stl`;

            const { data, error: uploadErr } = await supabase.storage
                .from('medalhas_personalizadas') // Nome do teu bucket no Supabase
                .upload(`final/${fileName}`, fileBuffer, {
                    contentType: 'model/stl',
                    upsert: true
                });

            // Limpeza de ficheiros locais (importante para não encher o disco)
            if (fs.existsSync(scadPath)) fs.unlinkSync(scadPath);
            if (fs.existsSync(stlPath)) fs.unlinkSync(stlPath);

            if (uploadErr) throw uploadErr;

            // 4. Retornar o URL público do ficheiro
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
app.listen(PORT, () => console.log(`Servidor a correr na porta ${PORT}`));