"use client";

import { useState } from "react";
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
                        <Label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold ml-1">
                            <span className="text-lg">📅</span> 생년월일
                        </Label>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={formData.year}
                                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                                    min={1900}
                                    max={2100}
                                    className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-6 text-base"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">년</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={formData.month}
                                    onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                                    min={1}
                                    max={12}
                                    className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-6 text-base"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">월</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={formData.day}
                                    onChange={(e) => setFormData({ ...formData, day: parseInt(e.target.value) })}
                                    min={1}
                                    max={31}
                                    className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-6 text-base"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">일</span>
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
                                    value={formData.hour}
                                    disabled={formData.unknown_time}
                                    onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value) })}
                                    min={0}
                                    max={23}
                                    className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-6 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">시</span>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={formData.minute}
                                    disabled={formData.unknown_time}
                                    onChange={(e) => setFormData({ ...formData, minute: parseInt(e.target.value) })}
                                    min={0}
                                    max={59}
                                    className="bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-[#d4af37] rounded-xl h-12 pl-3 pr-6 text-base disabled:opacity-40 disabled:cursor-not-allowed"
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
