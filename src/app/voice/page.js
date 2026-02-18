'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { queryDocuments } from '@/lib/api';
import { HiOutlineMicrophone, HiOutlineVolumeUp, HiOutlineStop } from 'react-icons/hi';

export default function VoicePage() {
    const { addNotification } = useStore();
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const recognitionRef = useRef(null);

    function startListening() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addNotification('Speech recognition not supported in this browser', 'error');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const text = result[0].transcript;
            setTranscript(text);

            if (result.isFinal) {
                setIsListening(false);
                handleVoiceQuery(text);
            }
        };

        recognition.onerror = () => {
            setIsListening(false);
            addNotification('Voice recognition error', 'error');
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        setTranscript('');
        setResponse('');
    }

    function stopListening() {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
    }

    async function handleVoiceQuery(text) {
        setLoading(true);
        try {
            const result = await queryDocuments(text);
            const answer = result.answer || 'No answer found.';
            setResponse(answer);
            setHistory(prev => [{ query: text, answer, time: new Date() }, ...prev].slice(0, 20));
            speakResponse(answer);
        } catch (e) {
            const errMsg = 'Sorry, I could not process that request.';
            setResponse(errMsg);
            speakResponse(errMsg);
        }
        setLoading(false);
    }

    function speakResponse(text) {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text.substring(0, 500));
        utterance.lang = 'hi-IN';
        utterance.rate = 0.85;
        utterance.pitch = 1.4;

        // Try to find a female Indian voice
        const voices = window.speechSynthesis.getVoices();
        const indianFemale = voices.find(v =>
            v.lang.includes('hi') && v.name.toLowerCase().includes('female')
        ) || voices.find(v =>
            v.lang.includes('hi')
        ) || voices.find(v =>
            v.lang.includes('en-IN')
        );

        if (indianFemale) utterance.voice = indianFemale;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }

    return (
        <AppShell>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        🎤 KHUSHI Voice Agent
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Ask questions about your circuit drawings using voice
                    </p>
                </div>

                {/* Voice Agent Card */}
                <div className="max-w-2xl mx-auto">
                    <div className="glass-card p-8 text-center mb-6">
                        {/* Avatar / Status */}
                        <motion.div
                            className="mb-6"
                            animate={isListening ? { scale: [1, 1.05, 1] } : {}}
                            transition={{ repeat: Infinity, duration: 2 }}
                        >
                            <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center text-4xl mb-4"
                                style={{
                                    background: isListening
                                        ? 'linear-gradient(135deg, #f43f5e, #ec4899)'
                                        : loading
                                            ? 'linear-gradient(135deg, #f59e0b, #f97316)'
                                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    boxShadow: isListening
                                        ? '0 0 60px rgba(244, 63, 94, 0.3)'
                                        : '0 0 40px rgba(59, 130, 246, 0.2)',
                                }}
                            >
                                👧🏽
                            </div>
                            <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                                {isListening ? 'KHUSHI is listening...' :
                                    loading ? 'KHUSHI is thinking...' :
                                        isSpeaking ? 'KHUSHI is speaking...' :
                                            'Hi! I\'m KHUSHI 🙏'}
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                {isListening ? 'Speak your question now' :
                                    loading ? 'Processing your query' :
                                        'Tap the mic to ask me anything'}
                            </p>
                        </motion.div>

                        {/* Waveform */}
                        <AnimatePresence>
                            {isListening && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 50 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-6"
                                >
                                    <div className="waveform">
                                        {[...Array(7)].map((_, i) => (
                                            <div key={i} className="bar" />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Mic Button */}
                        <div className="flex items-center justify-center gap-4">
                            <button
                                onClick={isListening ? stopListening : startListening}
                                disabled={loading}
                                className={`mic-button ${isListening ? 'listening' : 'idle'}`}
                            >
                                {isListening ? (
                                    <HiOutlineStop size={36} color="white" />
                                ) : (
                                    <HiOutlineMicrophone size={36} color="white" />
                                )}
                            </button>

                            {isSpeaking && (
                                <button
                                    onClick={stopSpeaking}
                                    className="w-14 h-14 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.3)' }}
                                >
                                    <HiOutlineVolumeUp size={24} style={{ color: 'var(--accent-rose)' }} />
                                </button>
                            )}
                        </div>

                        {/* Loading */}
                        {loading && (
                            <div className="mt-6">
                                <div className="spinner mx-auto" />
                            </div>
                        )}

                        {/* Transcript */}
                        {transcript && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-6 p-4 rounded-xl text-left"
                                style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}
                            >
                                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-blue)' }}>You said:</p>
                                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{transcript}</p>
                            </motion.div>
                        )}

                        {/* Response */}
                        {response && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 p-4 rounded-xl text-left"
                                style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.15)' }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-semibold" style={{ color: 'var(--accent-emerald)' }}>KHUSHI says:</p>
                                    <button
                                        onClick={() => speakResponse(response)}
                                        className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5"
                                        style={{ color: 'var(--accent-cyan)' }}
                                    >
                                        <HiOutlineVolumeUp size={12} /> Replay
                                    </button>
                                </div>
                                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                                    {response.substring(0, 800)}{response.length > 800 ? '...' : ''}
                                </p>
                            </motion.div>
                        )}
                    </div>

                    {/* History */}
                    {history.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
                                Recent Voice Queries
                            </h3>
                            <div className="space-y-2">
                                {history.slice(0, 5).map((h, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="glass-card p-4"
                                    >
                                        <p className="text-xs mb-1" style={{ color: 'var(--accent-blue)' }}>Q: {h.query}</p>
                                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            A: {h.answer.substring(0, 150)}...
                                        </p>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </AppShell>
    );
}
