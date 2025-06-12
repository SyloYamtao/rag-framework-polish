import React, { useState } from 'react';
import RandomImage from '../components/RandomImage';
import { apiBaseUrl } from '../config/config';

const ParseFile = () => {
  const [file, setFile] = useState(null);
  const [loadingMethod, setLoadingMethod] = useState('pymupdf');
  const [parsingOption, setParsingOption] = useState('all_text');
  const [parsedContent, setParsedContent] = useState(null);
  const [status, setStatus] = useState('');
  const [docName, setDocName] = useState('');
  const [isProcessed, setIsProcessed] = useState(false);
  const [documentType, setDocumentType] = useState('pdf');
  const [savedPath, setSavedPath] = useState('');

  const handleProcess = async () => {
    if (!file || !loadingMethod || !parsingOption) {
      setStatus('请选择所有必需的选项');
      return;
    }

    setStatus('处理中...');
    setParsedContent(null);
    setIsProcessed(false);
    setSavedPath('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('loading_method', loadingMethod);
      formData.append('parsing_option', parsingOption);
      formData.append('document_type', documentType);

      const response = await fetch(`${apiBaseUrl}/parse`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setParsedContent(data.parsed_content);
      setSavedPath(data.saved_path);
      setStatus('处理完成！');
      setIsProcessed(true);
    } catch (error) {
      console.error('Error:', error);
      setStatus(`错误: ${error.message}`);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file);
      const baseName = file.name.split('.')[0];
      setDocName(baseName);
      setDocumentType(file.name.split('.').pop().toLowerCase());
    }
  };

  const renderContent = (content) => {
    if (!content) return null;

    switch (content.type) {
      case 'text':
        return (
          <div className="text-sm text-gray-600 whitespace-pre-wrap">
            {content.content}
          </div>
        );
      case 'table':
        return (
          <div className="overflow-x-auto">
            <div className="text-sm text-gray-600 whitespace-pre-wrap">
              {content.content}
            </div>
            {content.metadata && (
              <div className="text-xs text-gray-500 mt-1">
                表格信息: {content.metadata.rows}行 x {content.metadata.columns}列
              </div>
            )}
          </div>
        );
      case 'image':
        return (
          <div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">
              {content.content}
            </div>
            {content.metadata && (
              <div className="text-xs text-gray-500 mt-1">
                OCR置信度: {content.metadata.ocr_confidence}%
              </div>
            )}
          </div>
        );
      case 'page':
        return (
          <div className="space-y-2">
            {content.content.map((item, idx) => (
              <div key={idx} className="border-t pt-2">
                {renderContent(item)}
              </div>
            ))}
          </div>
        );
      case 'section':
        return (
          <div className="space-y-2">
            <h4 className="font-bold text-gray-700">{content.title}</h4>
            {content.content.map((item, idx) => (
              <div key={idx} className="border-t pt-2">
                {renderContent(item)}
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">解析文件</h2>
      
      <div className="grid grid-cols-12 gap-6">
        {/* 左侧面板 (3/12) */}
        <div className="col-span-3 space-y-4">
          <div className="p-4 border rounded-lg bg-white shadow-sm">
            <div>
              <label className="block text-sm font-medium mb-1">上传文件</label>
              <input
                type="file"
                accept=".pdf,.md,.markdown,.jpg,.jpeg,.png,.bmp,.tiff"
                onChange={handleFileSelect}
                className="block w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">加载工具</label>
              <select
                value={loadingMethod}
                onChange={(e) => setLoadingMethod(e.target.value)}
                className="block w-full p-2 border rounded"
              >
                <option value="pymupdf">PyMuPDF</option>
                <option value="pypdf">PyPDF</option>
                <option value="unstructured">Unstructured</option>
                <option value="pdfplumber">PDF Plumber</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">解析选项</label>
              <select
                value={parsingOption}
                onChange={(e) => setParsingOption(e.target.value)}
                className="block w-full p-2 border rounded"
              >
                <option value="all_text">全部文本</option>
                <option value="by_pages">按页解析</option>
                <option value="by_titles">按标题解析</option>
                <option value="text_and_tables">文本和表格</option>
              </select>
            </div>

            <button 
              onClick={handleProcess}
              className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={!file}
            >
              处理文件
            </button>
          </div>
        </div>

        {/* 右侧面板 (9/12) */}
        <div className="col-span-9 border rounded-lg bg-white shadow-sm">
          {parsedContent ? (
            <div className="p-4">
              <h3 className="text-xl font-semibold mb-4">解析结果</h3>
              <div className="mb-4 p-3 border rounded bg-gray-100">
                <h4 className="font-medium mb-2">文档信息</h4>
                <div className="text-sm text-gray-600">
                  <p>总页数: {parsedContent.total_pages}</p>
                  <p>总块数: {parsedContent.total_chunks}</p>
                  <p>加载方法: {parsedContent.loading_method}</p>
                  <p>分块方法: {parsedContent.chunking_method}</p>
                  <p>时间戳: {parsedContent.timestamp && new Date(parsedContent.timestamp).toLocaleString()}</p>
                  {savedPath && (
                    <p className="mt-2 text-blue-600">
                      保存路径: {savedPath}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {parsedContent.chunks.map((chunk, idx) => (
                  <div key={idx} className="p-3 border rounded bg-gray-50">
                    <div className="font-medium text-sm text-gray-500 mb-1">
                      Chunk {chunk.metadata.chunk_id} - 第 {chunk.metadata.page_number} 页
                    </div>
                    <div className="text-sm text-gray-600 whitespace-pre-wrap">
                      {chunk.content}
                    </div>
                    {chunk.metadata.chunk_type === 'table' && (
                      <div className="text-xs text-gray-500 mt-1">
                        表格信息: {chunk.metadata.rows}行 x {chunk.metadata.columns}列
                      </div>
                    )}
                    {chunk.metadata.chunk_type === 'image' && (
                      <div className="text-xs text-gray-500 mt-1">
                        OCR置信度: {chunk.metadata.ocr_confidence}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <RandomImage message="上传并解析文件以查看结果" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ParseFile; 