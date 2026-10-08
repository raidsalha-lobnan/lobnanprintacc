const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const currentEditingInvoiceIdRef = useRef<string | null>(null);')) {
  content = content.replace(
    'const [cashAmountInput, setCashAmountInput] = useState<string>(\'0\');',
    `const [cashAmountInput, setCashAmountInput] = useState<string>('0');
  const currentEditingInvoiceIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    currentEditingInvoiceIdRef.current = editingPosInvoiceId;
  }, [editingPosInvoiceId]);`
  );
  
  // Replace in handleSaveInvoice
  content = content.replace(
    'editingInvoiceId: editingPosInvoiceId || undefined,',
    'editingInvoiceId: currentEditingInvoiceIdRef.current || editingPosInvoiceId || undefined,'
  );
  
  content = content.replace(
    'if (editingPosInvoiceId) {',
    'if (currentEditingInvoiceIdRef.current || editingPosInvoiceId) {'
  );
  
  content = content.replace(
    'if (editingPosInvoiceId) {',
    'if (currentEditingInvoiceIdRef.current || editingPosInvoiceId) {'
  );

  content = content.replace(
    'if (editingPosInvoiceId) {',
    'if (currentEditingInvoiceIdRef.current || editingPosInvoiceId) {'
  );
  
  fs.writeFileSync(file, content);
  console.log("Ref added");
}
