# DNA Triangulation Calculator

A sophisticated web application for analyzing DNA segment data to identify triangulated groups of genetic matches. This tool helps genealogists confirm shared ancestry by finding overlapping DNA segments between multiple matches.

## 🧬 What is DNA Triangulation?

DNA triangulation is a genealogical technique that confirms shared ancestry by identifying overlapping DNA segments between three or more people. When multiple DNA matches share the same segment on the same chromosome, it strongly suggests they inherited that DNA from a common ancestor.

## ✨ Features

### Core Functionality
- **Multi-file CSV Processing**: Upload and process multiple chromosome browser CSV files
- **Intelligent Header Detection**: Automatically detects and maps CSV headers from various DNA testing companies
- **Advanced Name Deduplication**: Smart matching and merging of duplicate entries across files
- **Flexible Data Parsing**: Handles various CSV formats and data structures

### Analysis Capabilities
- **Triangulation Detection**: Identifies overlapping DNA segments between multiple matches
- **Relationship Prediction**: Estimates relationships based on shared DNA amounts
- **Evidence Levels**: Rates each group by the size of the stretch everyone shares and flags likely pile-up regions
- **Chromosome Browser**: Visual representation of triangulated segments across chromosomes

### Enhanced Features
- **GEDCOM Integration**: Cross-reference with family tree data for enhanced analysis
- **Genealogical Tree Matching**: Identify potential common ancestors
- **Advanced Filtering**: Filter results by chromosome, size, confidence, and more
- **Research Annotations**: Add notes, surnames, locations, and tags to groups
- **Export Functionality**: Download results as CSV for further analysis

## 🚀 Live Demo

Visit the live application: [https://ginn444.github.io/DNA-Triangulation-Calculator/](https://ginn444.github.io/DNA-Triangulation-Calculator/)

Every push to `main` is deployed to GitHub Pages by `.github/workflows/pages.yml`.

## 📋 Supported CSV Formats

The application automatically detects and processes CSV files from various sources:

### Required Columns (automatically detected)
- **Chromosome**: Chromosome number (1-22, or X; `chr7`/`chrX` style values are accepted)
- **Start Position**: Starting position of DNA segment
- **End Position**: Ending position of DNA segment  
- **Size/Overlap**: Segment size in centimorgans (cM)

### Optional Columns (enhanced analysis)
- **Match Name**: Name of the DNA match
- **Y-Haplogroup**: Paternal haplogroup information
- **mtDNA Haplogroup**: Maternal haplogroup information
- **Ancestral Surnames**: Known family surnames
- **Notes**: Additional match information
- **Lineage**: Which line the match is related through (`P`, `M`, `PPM`, `Paternal`, ...)

### Supported Platforms
- 23andMe chromosome browser exports
- AncestryDNA shared matches data
- FamilyTreeDNA chromosome browser
- MyHeritage DNA matches
- GEDmatch chromosome browser
- Custom CSV formats with flexible header mapping

## 🛠️ Installation & Development

### Prerequisites
- Node.js 20.19+ (22 recommended)
- npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/ginn444/DNA-Triangulation-Calculator.git
cd dna-triangulation-calculator

# Install dependencies
npm install

# Start development server
npm run dev

# Run the checks CI runs
npm run lint
npm run typecheck
npm test

# Build for production
npm run build
```

## 📖 Usage Guide

### 1. Upload CSV Files
- Click the upload area or drag and drop your CSV files
- Multiple files can be processed simultaneously
- Files are automatically validated and parsed

### 2. Configure Analysis Settings
- **Minimum Segment Size**: Set threshold for segment inclusion (default: 7 cM)
- **Minimum Matches**: Required number of matches for triangulation (default: 3)
- **Minimum Shared Stretch**: How much DNA every match in a group must share with you on the same stretch (default: 7 cM; 15+ cM is very reliable)
- **Enable Advanced Features**: Relationship prediction

### 3. Process Data
- Click "Calculate Triangulations" to begin analysis
- Monitor progress through real-time status updates
- Review any warnings about data quality

### 4. Analyze Results
- Browse triangulation groups by chromosome
- Use filters to focus on specific criteria
- Select a group (in the list or the chromosome browser), then use **Add research notes** to record notes, surnames, locations and tags
- Export results for external analysis

### 5. Tag Lineages to Separate Your Lines
You carry two copies of each chromosome, one from each parent, so matches from different lines can overlap at the same position without being related to each other. Tagging the matches you can place keeps those lines apart.

- In any group, use the **Lineage** dropdown next to a match to say which line it is related through. Paths read from you outwards using **P** (father) and **M** (mother):
  - `P` = Dad's side, `M` = Mom's side
  - `PP` = Dad's dad, `PM` = Dad's mom
  - `PMP` = Dad's mom's dad, and so on (up to four generations)
- Groups regroup immediately. With **Separate Groups by Lineage** on (Analysis Settings, default on), a match is never grouped with matches tagged to a different branch: `PP` and `PPM` can share a group, `PP` and `PM` cannot.
- Each group shows the most specific line its tagged members share. Untagged members show the group's line as a suggestion ("likely PPM").
- Use the **Lineage** filter to see one line and everything further back on it (e.g. `PPP` for Dad's dad's dad), groups with no tags yet, or groups with conflicting tags.
- X chromosome groups tagged through a father's father (`PP` anywhere in the path) are flagged, because a father never passes his X chromosome to his son.
- Tags are saved in your browser and reused for future uploads. You can also tag in bulk by adding a `Lineage` column to your CSV (values like `P`, `PPM`, `Paternal`, `Maternal`).

### 6. Time + Place: Hunting an Ancestor Who Isn't on Paper
When a triangulated group's ancestor on paper doesn't fit (for example a misattributed parentage event), use the group as a coordinate: **time** from the segment's length, **place** from where people lived then. Expand any group to see its **Time + Place** panel.

- **Genetic clock.** Each generation cuts segments shorter, so the length of the group's segments estimates how many generations back the shared ancestor lived. The app shows the most likely generation, an 80% range, and a bar for each generation. One segment is a rough clock: a 20 cM block most likely points about 4 generations back (range ~1–10); blocks under ~12 cM are too short to date closely. Model: segment length is exponential with rate 2G/100 per cM for cousins whose ancestor is G generations back, conditioned on the list's reporting threshold (Thomas et al. 1994; Huff et al. 2011).
- **Your ancestors in the window.** Upload your tree and pick yourself as the home person. The app lists your ancestors in the clock's range, with their line (`P`, `PM`, ...) and birth place. If the group is tagged with a lineage, only ancestors on that line are shown.
- **Where people lived.** Places of people in the window (your ancestors, plus anyone in a match's tree, placed in time by birth year) are clustered at county and state level and weighted by how likely the clock says each person's generation is. A **Neighbor effect** place is one where different surnames or different trees converge, which is a good place to look for the real ancestor.
- **Matches' trees.** Upload several GEDCOMs: your own first, then any matches' trees. Each extra tree is linked to the match whose name appears in it (or set "Whose tree?"), and only counts for groups that include that match. Unlinked trees count for every group.

### 7. GEDCOM Integration (Optional)
- Upload GEDCOM file for family tree cross-referencing
- Enable cross-verification in settings
- View suggested common ancestors

## 🔧 Technical Architecture

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Vite** for build tooling
- **Vitest** for unit tests

### Key Components
- `TriangulationCalculator`: Main application component
- `FileUpload`: Handles CSV file processing
- `TriangulationResults`: Displays analysis results
- `ChromosomeBrowser`: Visual chromosome representation
- `FilterAndAnnotation`: Advanced filtering and research tools

### Core Algorithms
- **CSV Parser**: Intelligent header detection and data mapping
- **Triangulation Engine**: Overlap detection and group formation
- **Relationship Predictor**: Statistical relationship estimation
- **Name Deduplication**: Smart matching across multiple files

## 📊 Analysis Methodology

### What the app can and cannot tell from a chromosome browser file
A chromosome browser export lists the segments each match shares **with you**. Triangulation has three legs: you share a segment with A, you share it with B, and **A shares it with B**. The third leg is not in these files, so the app finds the first two legs (everyone overlapping you on the same stretch) and rates how strong that evidence is. Because you have two copies of every chromosome, matches overlapping you on the same stretch may be on your mother's copy or your father's; confirm the third leg with your testing company's triangulation tool or GEDmatch, and use lineage tags to keep the two sides apart.

### How groups are formed
1. **Deduplication**: Merge name variants of the same person and drop identical segments exported in more than one file.
2. **Minimum shared stretch**: Every member of a group must share at least the minimum (default 7 cM) with you on one common stretch. Its size in cM is estimated from each member's own segment (cM per base pair), using the most conservative member.
3. **Best groups first**: For every segment, the app works out the group it would anchor (closest overlaps first). It keeps the group with the largest shared stretch (then the most people), sets its members aside, and repeats. A new member must share at least half of the anchor segment, and 70% of what the group's first pair shares, so weaker partial overlaps cannot shrink a strong family cluster.
4. **Distinct people**: Groups need enough *distinct people* (one person's multiple segments never count twice), and matches tagged to conflicting lineages are never grouped together.

### Evidence levels
- **Large overlap (15+ cM)**: Everyone shares 15 cM or more with you here. Segments this size are almost always inherited from a real common ancestor (ISOGG), so these are the strongest leads.
- **Overlap 7-15 cM**: Meets the minimum; a reasonable lead.
- **Possible pile-up**: The stretch is covered by far more of your matches than is typical for your upload (more than 3x the median 1 Mb stretch, and at least 10 matches). Pile-ups usually reflect very old shared ancestry, so they are weak evidence of a recent common ancestor.

Results are sorted with the largest overlaps first. Use the **Evidence** filter to hide possible pile-ups or show only large overlaps.

### Relationship Prediction
Each match's relationship is estimated from that person's total shared cM across all their uploaded segments (never from a group's combined cM), using statistical data from the Shared cM Project:
- Parent/Child: 3400-3720 cM
- Full Sibling: 2200-3400 cM
- 1st Cousin: 550-1300 cM
- 2nd Cousin: 200-600 cM
- And more distant relationships...

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

### Development Guidelines
- Follow TypeScript best practices
- Maintain component modularity
- Add tests for new features
- Update documentation

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Shared cM Project**: Relationship prediction data
- **International Society of Genetic Genealogy (ISOGG)**: Standards and best practices
- **DNA testing companies**: For providing the data formats this tool supports

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Check the documentation
- Review existing discussions

---

**Note**: This tool is designed for genealogical research purposes. Always verify DNA analysis results with additional evidence and consider consulting with genetic genealogy experts for complex cases.