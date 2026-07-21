"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { notify } from "@/lib/useToast";
import { getLastInput, setLastInput } from "@/lib/storage";

interface SajuFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCalculate: (data: any) => void;
    isLoading: boolean;
}

export function SajuForm({ onCalculate, isLoading }: SajuFormProps) {
    const [formData, setFormData] = useState({
        name: "하늘",
        gender: "여",
        year: 1990,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        calendar_type: "양력",
        is_leap: false,
        unknown_time: false,
    });

    // 마운트 후 최근 입력값을 복원한다(있으면). SSR-클라 hydration 불일치를 피하려 effect에서 처리.
    useEffect(() => {
        const last = getLastInput();
        if (last) setFormData((prev) => ({ ...prev, ...last }));
    }, []);

    // 달력에서 날짜를 고르면 연·월·일 칸을 한 번에 채운다(양력 기준)
    const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value; // YYYY-MM-DD
        if (!v) return;
        const [y, m, d] = v.split("-").map((n) => parseInt(n, 10));
        setFormData({ ...formData, year: y, month: m, day: d, calendar_type: "양력" });
    };

    // 현재 연·월·일을 date input value(YYYY-MM-DD)로 (유효할 때만)
    const dateValue =
        formData.year >= 1900 && formData.year <= 2100 && formData.month >= 1 && formData.day >= 1
            ? `${formData.year}-${String(formData.month).padStart(2, "0")}-${String(formData.day).padStart(2, "0")}`
            : "";

    // 클라이언트 입력 검증으로 백엔드 500을 예방한다
    const validate = (): string | null => {
        const { year, month, day, hour, minute, unknown_time } = formData;
        if (!year || year < 1900 || year > 2100) return "연도는 1900~2100 사이여야 합니다.";
        if (!month || month < 1 || month > 12) return "월은 1~12 사이여야 합니다.";
        if (!day || day < 1 || day > 31) return "일은 1~31 사이여야 합니다.";
        // 시간 모름이면 시·분 검증 생략
        if (!unknown_time) {
            if (hour < 0 || hour > 23) return "시는 0~23 사이여야 합니다.";
            if (minute < 0 || minute > 59) return "분은 0~59 사이여야 합니다.";
        }
        return null;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const error = validate();
        if (error) {
            notify.error("입력값을 확인해 주세요", error);
            return;
        }
        setLastInput(formData); // 다음 방문 때 다시 채워지도록 기억
        onCalculate(formData);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto glass-card border-none shadow-2xl fade-up">
            <CardContent className="pt-10 px-8 pb-10">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <Label htmlFor="name" className="text-slate-600 dark:text-slate-300 font-bold ml-1">성함 (선택)</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="홍길동"
                                className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] rounded-xl h-12 transition-all"
                            />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-slate-600 dark:text-slate-300 font-bold ml-1">성별</Label>
                            <Select
                                value={formData.gender}
                                onValueChange={(val: string) => setFormData({ ...formData, gender: val })}
                            >
                                <SelectTrigger className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12">
                                    <SelectValue placeholder="성별 선택" />
                                </SelectTrigger>
                                <SelectContent className="glass-card border-none shadow-xl">
                                    <SelectItem value="여">여성</SelectItem>
                                    <SelectItem value="남">남성</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between ml-1">
                            <Label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold">
                                <span className="text-lg">📅</span> 생년월일
                            </Label>
                            {/* 달력에서 한 번에 고르기 (양력 기준) — 직접 숫자 입력도 그대로 가능 */}
                            <label className="relative inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-[#d4af37] cursor-pointer transition-all">
                                🗓️ 달력에서 고르기
                                <input
                                    type="date"
                                    value={dateValue}
                                    min="1900-01-01"
                                    max="2100-12-31"
                                    onChange={handleDatePick}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label="달력에서 생년월일 선택"
                                />
                            </label>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            <div className="relative col-span-2">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.year}
                                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                                    min={1900}
                                    max={2100}
                                    className="no-spinner bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-7 text-base"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">년</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.month}
                                    onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                                    min={1}
                                    max={12}
                                    className="no-spinner bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-7 text-base"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">월</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.day}
                                    onChange={(e) => setFormData({ ...formData, day: parseInt(e.target.value) })}
                                    min={1}
                                    max={31}
                                    className="no-spinner bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-7 text-base"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">일</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between ml-1">
                            <Label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold">
                                <span className="text-lg">⏰</span> 태어난 시간
                            </Label>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, unknown_time: !formData.unknown_time })}
                                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${formData.unknown_time
                                    ? "bg-[#d4af37] text-white border-[#d4af37]"
                                    : "bg-white/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-[#d4af37]"}`}
                            >
                                {formData.unknown_time ? "✓ 시간 모름" : "시간 모름"}
                            </button>
                        </div>
                        {formData.unknown_time && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">시간을 모르면 시주(時)는 참고용으로만 풀이됩니다.</p>
                        )}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="relative">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.hour}
                                    disabled={formData.unknown_time}
                                    onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value) })}
                                    min={0}
                                    max={23}
                                    className="no-spinner bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-7 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">시</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.minute}
                                    disabled={formData.unknown_time}
                                    onChange={(e) => setFormData({ ...formData, minute: parseInt(e.target.value) })}
                                    min={0}
                                    max={59}
                                    className="no-spinner bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-7 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">분</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <Label className="text-slate-600 dark:text-slate-300 font-bold ml-1">달력 유형</Label>
                            <Select
                                value={formData.calendar_type}
                                onValueChange={(val: string) => setFormData({ ...formData, calendar_type: val })}
                            >
                                <SelectTrigger className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="glass-card border-none shadow-xl">
                                    <SelectItem value="양력">양력</SelectItem>
                                    <SelectItem value="음력">음력</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center space-x-3 pt-9">
                            {formData.calendar_type === "음력" && (
                                <>
                                    <input
                                        type="checkbox"
                                        id="is_leap"
                                        checked={formData.is_leap}
                                        onChange={(e) => setFormData({ ...formData, is_leap: e.target.checked })}
                                        className="w-5 h-5 accent-[#d4af37] border-slate-200 rounded-lg cursor-pointer"
                                    />
                                    <Label htmlFor="is_leap" className="text-slate-600 font-medium cursor-pointer">음력 윤달 여부</Label>
                                </>
                            )}
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] hover:from-[#bf953f] hover:to-[#aa771c] text-white font-bold py-8 rounded-2xl text-xl shadow-2xl transition-all hover:scale-[1.02] border-none mt-4 group"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>운명의 지도를 그리는 중...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span>나의 사주 명식 확인하기</span>
                                <span className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
