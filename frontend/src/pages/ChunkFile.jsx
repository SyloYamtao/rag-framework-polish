import React, { useState, useEffect } from 'react';
import RandomImage from '../components/RandomImage';
import { apiBaseUrl } from '../config/config';

const ChunkFile = () => {
  const [loadedDocuments, setLoadedDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [chunkingOption, setChunkingOption] = useState('by_pages');
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [chunks, setChunks] = useState(null);
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('chunks');
  const [processingStatus, setProcessingStatus] = useState('');
  const [chunkedDocuments, setChunkedDocuments] = useState([]);
  const [selectedChunkedDoc, setSelectedChunkedDoc] = useState(null);
  const [chunkingStats, setChunkingStats] = useState(null);

  useEffect(() => {
    fetchLoadedDocuments();
  }, []);

  const fetchLoadedDocuments = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/documents?type=loaded`);
      const data = await response.json();
      setLoadedDocuments(data.documents);

      const chunkedResponse = await fetch(`${apiBaseUrl}/documents?type=chunked`);
      if (!chunkedResponse.ok) {
        throw new Error(`HTTP error! status: ${chunkedResponse.status}`);
      }
      const chunkedData = await chunkedResponse.json();
      console.log('Chunked documents response:', chunkedData);
      
      if (!chunkedData.documents || !Array.isArray(chunkedData.documents)) {
        console.error('Invalid chunked documents data:', chunkedData);
        return;
      }

      const chunkedDocsWithDetails = await Promise.all(
        chunkedData.documents.map(async (doc) => {
          try {
            const detailResponse = await fetch(`${apiBaseUrl}/documents/${doc.name}?type=chunked`);
            if (!detailResponse.ok) {
              console.error(`Error fetching details for ${doc.name}:`, detailResponse.status);
              return doc;
            }
            const detailData = await detailResponse.json();
            console.log(`Details for ${doc.name}:`, detailData);
            
            return {
              ...doc,
              total_pages: detailData.total_pages,
              total_chunks: detailData.total_chunks,
              chunking_method: detailData.chunking_method,
              timestamp: detailData.timestamp
            };
          } catch (error) {
            console.error(`Error processing document ${doc.name}:`, error);
            return doc;
          }
        })
      );
      
      console.log('Final chunked documents:', chunkedDocsWithDetails);
      setChunkedDocuments(chunkedDocsWithDetails);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setProcessingStatus(`Error fetching documents: ${error.message}`);
    }
  };

  const handleChunk = async () => {
    if (!selectedDoc || !chunkingOption) {
      setStatus('请选择文档和分块选项');
      return;
    }

    setStatus('处理中...');
    setChunks(null);

    try {
      const docId = selectedDoc.endsWith('.json') ? selectedDoc : `${selectedDoc}.json`;
      
      const response = await fetch(`${apiBaseUrl}/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doc_id: docId,
          chunking_option: chunkingOption,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Chunk response:', data);

      // 计算分块统计信息
      const stats = calculateChunkingStats(data.chunks);
      setChunkingStats(stats);

      setChunks({
        filename: data.filename,
        total_pages: data.total_pages,
        total_chunks: data.total_chunks,
        loading_method: data.loading_method,
        chunking_method: data.chunking_method,
        timestamp: data.timestamp,
        chunks: data.chunks
      });

      setStatus('分块完成！');
      fetchLoadedDocuments();

    } catch (error) {
      console.error('Error:', error);
      setStatus(`错误: ${error.message}`);
    }
  };

  const calculateChunkingStats = (chunks) => {
    if (!chunks || !Array.isArray(chunks)) return null;

    const stats = {
      avgWords: 0,
      avgChars: 0,
      minWords: Infinity,
      maxWords: 0,
      minChars: Infinity,
      maxChars: 0,
      totalWords: 0,
      totalChars: 0,
    };

    chunks.forEach(chunk => {
      const wordCount = chunk.metadata.word_count;
      const charCount = chunk.metadata.char_count;

      stats.totalWords += wordCount;
      stats.totalChars += charCount;
      stats.minWords = Math.min(stats.minWords, wordCount);
      stats.maxWords = Math.max(stats.maxWords, wordCount);
      stats.minChars = Math.min(stats.minChars, charCount);
      stats.maxChars = Math.max(stats.maxChars, charCount);
    });

    stats.avgWords = Math.round(stats.totalWords / chunks.length);
    stats.avgChars = Math.round(stats.totalChars / chunks.length);

    return stats;
  };

  const handleDeleteDocument = async (docName) => {
    try {
      const response = await fetch(`${apiBaseUrl}/documents/${docName}?type=chunked`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setProcessingStatus('Document deleted successfully');
      fetchLoadedDocuments();
      if (selectedDoc === docName) {
        setSelectedDoc('');
        setChunks(null);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setProcessingStatus(`Error deleting document: ${error.message}`);
    }
  };

  const handleViewDocument = async (docName) => {
    try {
      const response = await fetch(`${apiBaseUrl}/documents/${docName}?type=chunked`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setChunks(data);
      setActiveTab('chunks');
    } catch (error) {
      console.error('Error viewing document:', error);
      setProcessingStatus(`Error viewing document: ${error.message}`);
    }
  };

  const renderChunkingOptions = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">分块方法</label>
        <select
          value={chunkingOption}
          onChange={(e) => setChunkingOption(e.target.value)}
          className="block w-full p-2 border rounded"
        >
          <option value="by_pages">按页分块</option>
          <option value="fixed_size">固定大小分块</option>
          <option value="by_paragraphs">按段落分块</option>
          <option value="by_sentences">按句子分块</option>
        </select>
      </div>

      {chunkingOption === 'fixed_size' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">分块大小 (字符数)</label>
            <input
              type="number"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="block w-full p-2 border rounded"
              min="100"
              max="5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">重叠大小 (字符数)</label>
            <input
              type="number"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
              className="block w-full p-2 border rounded"
              min="0"
              max={chunkSize}
            />
          </div>
        </>
      )}
    </div>
  );

  const renderChunkingStats = () => {
    if (!chunkingStats) return null;

    return (
      <div className="mb-4 p-3 border rounded bg-blue-50">
        <h4 className="font-medium mb-2 text-blue-700">分块统计信息</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-600">平均字数: {chunkingStats.avgWords}</p>
            <p className="text-gray-600">最小字数: {chunkingStats.minWords}</p>
            <p className="text-gray-600">最大字数: {chunkingStats.maxWords}</p>
          </div>
          <div>
            <p className="text-gray-600">平均字符数: {chunkingStats.avgChars}</p>
            <p className="text-gray-600">最小字符数: {chunkingStats.minChars}</p>
            <p className="text-gray-600">最大字符数: {chunkingStats.maxChars}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    return (
      <div className="p-4 w-full h-full flex flex-col">
        <div className="flex mb-4 border-b">
          <button
            className={`px-4 py-2 ${
              activeTab === 'chunks'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600'
            }`}
            onClick={() => setActiveTab('chunks')}
          >
            分块预览
          </button>
          <button
            className={`px-4 py-2 ml-4 ${
              activeTab === 'documents'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600'
            }`}
            onClick={() => setActiveTab('documents')}
          >
            文档管理
          </button>
        </div>

        {activeTab === 'chunks' ? (
          chunks ? (
            <div className="w-full">
              <div className="mb-4 p-3 border rounded bg-gray-100">
                <h4 className="font-medium mb-2">文档信息</h4>
                <div className="text-sm text-gray-600">
                  <p>文件名: {chunks.filename}</p>
                  <p>总页数: {chunks.total_pages}</p>
                  <p>总分块数: {chunks.total_chunks}</p>
                  <p>加载方法: {chunks.loading_method}</p>
                  <p>分块方法: {chunks.chunking_method}</p>
                  {chunks.chunk_size && <p>分块大小: {chunks.chunk_size} 字符</p>}
                  <p>处理时间: {chunks.timestamp ? new Date(chunks.timestamp).toLocaleString() : 'N/A'}</p>
                </div>
              </div>

              {renderChunkingStats()}

              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {Array.isArray(chunks.chunks) && chunks.chunks.map((chunk) => (
                  <div key={chunk.metadata.chunk_id} className="p-3 border rounded bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="font-medium text-sm text-gray-500 mb-1">
                      分块 {chunk.metadata.chunk_id}
                    </div>
                    <div className="text-xs text-gray-400 mb-2 flex flex-wrap gap-2">
                      <span>页码: {chunk.metadata.page_range}</span>
                      <span>字数: {chunk.metadata.word_count}</span>
                      <span>字符数: {chunk.metadata.char_count}</span>
                      <span>类型: {chunk.metadata.chunk_type}</span>
                    </div>
                    <div className="text-sm mt-2">
                      <div className="text-gray-600 whitespace-pre-wrap">{chunk.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <RandomImage message="选择文档并创建分块以查看结果" />
          )
        ) : (
          <div className="flex flex-col w-full h-full">
            <h3 className="text-xl font-semibold mb-4">文档管理</h3>
            <div className="space-y-4 w-full">
              {chunkedDocuments.length > 0 ? (
                chunkedDocuments.map((doc) => (
                  <div key={doc.name} className="p-4 border rounded-lg bg-gray-50 w-full hover:bg-gray-100 transition-colors">
                    <div className="flex justify-between items-start w-full">
                      <div className="flex-grow">
                        <h4 className="font-medium text-lg">{doc.name}</h4>
                        <div className="text-sm text-gray-600 mt-1">
                          <p>页数: {doc.total_pages || 'N/A'}</p>
                          <p>分块数: {doc.total_chunks || 'N/A'}</p>
                          <p>分块方法: {doc.chunking_method || 'N/A'}</p>
                          <p>处理时间: {doc.timestamp ? new Date(doc.timestamp).toLocaleString() : 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => handleViewDocument(doc.name)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          查看
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.name)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-8 w-full">
                  暂无分块文档
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">文档分块</h2>
      
      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel */}
        <div className="col-span-3 space-y-4">
          <div className="p-4 border rounded-lg bg-white shadow-sm">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">选择文档</label>
              <select
                value={selectedDoc}
                onChange={(e) => setSelectedDoc(e.target.value)}
                className="block w-full p-2 border rounded"
              >
                <option value="">选择文档...</option>
                {loadedDocuments.map((doc) => (
                  <option key={doc.name} value={doc.name}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>

            {renderChunkingOptions()}

            <button 
              onClick={handleChunk}
              className="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              disabled={!selectedDoc}
            >
              创建分块
            </button>
          </div>

          {status && (
            <div className={`p-4 rounded-lg ${
              status.includes('错误') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {status}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="col-span-9 border rounded-lg bg-white shadow-sm">
          {renderRightPanel()}
        </div>
      </div>
    </div>
  );
};

export default ChunkFile;